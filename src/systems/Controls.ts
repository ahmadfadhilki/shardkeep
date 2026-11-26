import Phaser from 'phaser';
import { IS_TOUCH } from '../config';
import { stageTouch } from '../ui/TouchControls';

/**
 * Wraps keyboard + mouse so the rest of the game never deals with raw input.
 * To rebind controls (or add a gamepad later), only this file changes.
 *
 *   Move ............ WASD or Arrow keys
 *   Attack .......... Left mouse button (hold to keep combo-ing), aims at the cursor
 *   Dodge ........... Right mouse button (Space also works)
 *   Skill ........... E
 *   Chain skill ..... F (when an enemy is stunned / knocked down)
 *   Switch hero ..... Q (next) or 1 / 2 / 3
 *   Potions ......... Z (health) / X (mana)
 *   Pause ........... Esc
 *
 * On phones (IS_TOUCH) the same PlayerInput is filled from the on-screen
 * joystick and buttons instead (see ui/TouchControls.ts), and attacks aim
 * automatically (autoAim), because there is no mouse to aim with.
 */

/** Everything the player asked for this frame. */
export interface PlayerInput {
  /** Movement direction, length 0 or 1. */
  move: Phaser.Math.Vector2;
  /** Mouse position in WORLD coordinates (accounts for camera scroll). */
  aimWorld: Phaser.Math.Vector2;
  attack: boolean;
  attackHeld: boolean;
  skill: boolean;
  dodge: boolean;
  /** Chain skill (F). */
  chain: boolean;
  switchNext: boolean;
  /** 0, 1, 2 when a number key was pressed, otherwise -1. */
  select: number;
  /** Drink a potion (Z = health, X = mana). */
  potionHealth: boolean;
  potionMana: boolean;
  pause: boolean;
  /** No mouse to aim with (touch): aim at the nearest enemy instead. */
  autoAim: boolean;
}

export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private scene: Phaser.Scene;
  // Mouse clicks arrive as events between frames; we remember them
  // until the next read() so a quick click is never missed.
  private leftClicked = false;
  private rightClicked = false;
  private readonly input: PlayerInput = {
    move: new Phaser.Math.Vector2(),
    aimWorld: new Phaser.Math.Vector2(),
    attack: false,
    attackHeld: false,
    skill: false,
    dodge: false,
    chain: false,
    switchNext: false,
    select: -1,
    potionHealth: false,
    potionMana: false,
    pause: false,
    autoAim: false,
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys({
      up: 'W',
      down: 'S',
      left: 'A',
      right: 'D',
      up2: 'UP',
      down2: 'DOWN',
      left2: 'LEFT',
      right2: 'RIGHT',
      skill: 'E',
      dodge: 'SPACE',
      next: 'Q',
      chain: 'F',
      one: 'ONE',
      two: 'TWO',
      three: 'THREE',
      potionHp: 'Z',
      potionMp: 'X',
      pause: 'ESC',
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    // Stop the browser's right-click menu from popping up over the game.
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (IS_TOUCH) return; // touches are handled by the on-screen controls
      if (p.button === 0) this.leftClicked = true;
      else if (p.button === 2) this.rightClicked = true;
    });

    // Action keys: remember every press via the key's 'down' event.
    // (Phaser's JustDown() forgets a press once the key is released, so a quick
    // tap during a hit-stop freeze could be lost. An event-based queue can't.)
    for (const name of ['skill', 'dodge', 'chain', 'next', 'one', 'two', 'three', 'potionHp', 'potionMp', 'pause']) {
      this.keys[name].on('down', () => this.pressed.add(name));
    }
  }

  /** Action keys pressed since the last read(). */
  private pressed = new Set<string>();

  /** True if `name` was pressed since the last read(). */
  private took(name: string): boolean {
    return this.pressed.has(name);
  }

  /** Read all input for this frame. Call exactly once per frame. */
  read(): PlayerInput {
    const k = this.keys;
    const i = this.input;

    // Movement: normalize so diagonals aren't ~41% faster than straight lines.
    const x = (k.right.isDown || k.right2.isDown ? 1 : 0) - (k.left.isDown || k.left2.isDown ? 1 : 0);
    const y = (k.down.isDown || k.down2.isDown ? 1 : 0) - (k.up.isDown || k.up2.isDown ? 1 : 0);
    i.move.set(x, y).normalize();

    // Convert the mouse's screen position into a world position. We do this
    // every frame because the camera may scroll even when the mouse is still.
    const pointer = this.scene.input.activePointer;
    const world = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    i.aimWorld.set(world.x, world.y);

    i.attack = this.leftClicked;
    i.attackHeld = pointer.leftButtonDown();
    i.dodge = this.rightClicked || this.took('dodge');
    i.skill = this.took('skill');
    i.chain = this.took('chain');
    i.switchNext = this.took('next');
    i.select = this.took('one') ? 0 : this.took('two') ? 1 : this.took('three') ? 2 : -1;
    i.potionHealth = this.took('potionHp');
    i.potionMana = this.took('potionMp');
    i.pause = this.took('pause');

    i.autoAim = false;
    const touch = IS_TOUCH ? stageTouch.current : null;
    if (touch) this.mergeTouch(touch);

    this.leftClicked = false;
    this.rightClicked = false;
    this.pressed.clear();
    return i;
  }

  /** Add the on-screen joystick and buttons to this frame's input. */
  private mergeTouch(t: NonNullable<typeof stageTouch.current>): void {
    const i = this.input;
    if (i.move.lengthSq() === 0) i.move.copy(t.move); // keyboard still wins if one is plugged in
    i.attack = t.took('attack');
    i.attackHeld = t.isHeld('attack');
    i.skill ||= t.took('skill');
    i.dodge ||= t.took('dodge');
    i.chain ||= t.took('chain');
    i.switchNext ||= t.took('swap');
    i.potionHealth ||= t.took('potionHp');
    i.potionMana ||= t.took('potionMp');
    i.pause ||= t.took('pause');
    if (t.took('hero0')) i.select = 0;
    if (t.took('hero1')) i.select = 1;
    if (t.took('hero2')) i.select = 2;
    i.autoAim = true;
    t.consume();
  }
}
