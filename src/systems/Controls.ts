import Phaser from 'phaser';
import { IS_TOUCH } from '../config';
import { stageTouch } from '../ui/TouchControls';
import { CONTROLS_CHANGED, getControlSettings, MOUSE_BUTTONS, type ActionId } from './ControlSettings';

/**
 * Wraps keyboard + mouse so the rest of the game never deals with raw input.
 *
 * Which key does what comes from ControlSettings (the player can rebind them
 * on the Controls screen). Defaults:
 *
 *   Move ............ WASD (arrow keys always work too)
 *   Attack .......... Left mouse button (hold to keep combo-ing), aims at the cursor
 *   Dodge ........... Right mouse button
 *   Skill ........... E
 *   Chain skill ..... F (when an enemy is stunned / knocked down)
 *   Switch hero ..... Q (next), or 1 / 2 / 3 (fixed)
 *   Potions ......... Z (health) / X (mana)
 *   Menu ............ Esc (fixed)
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
  /** Chain skill. */
  chain: boolean;
  switchNext: boolean;
  /** 0, 1, 2 when a number key was pressed, otherwise -1. */
  select: number;
  /** Drink a potion. */
  potionHealth: boolean;
  potionMana: boolean;
  pause: boolean;
  /** No mouse to aim with (touch): aim at the nearest enemy instead. */
  autoAim: boolean;
}

/** Actions that happen once per press (attack is also "held"; movement is only held). */
const PRESS_ACTIONS: ActionId[] = ['attack', 'skill', 'dodge', 'chain', 'swap', 'potionHp', 'potionMp'];

export class Controls {
  private readonly scene: Phaser.Scene;
  /** One Phaser Key object per keyboard binding, by action. */
  private keys: Partial<Record<ActionId, Phaser.Input.Keyboard.Key>> = {};
  /** Fixed keys: arrows, 1/2/3, Esc. */
  private fixed: Record<string, Phaser.Input.Keyboard.Key> = {};
  /**
   * Presses since the last read(). Key presses and mouse clicks arrive as
   * events BETWEEN frames, so we queue them: a quick tap is never missed,
   * not even during a hit-stop freeze.
   */
  private pressed = new Set<string>();

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

    this.fixed = kb.addKeys('UP,DOWN,LEFT,RIGHT,ONE,TWO,THREE,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
    this.fixed.ONE.on('down', () => this.pressed.add('one'));
    this.fixed.TWO.on('down', () => this.pressed.add('two'));
    this.fixed.THREE.on('down', () => this.pressed.add('three'));
    this.fixed.ESC.on('down', () => this.pressed.add('pause'));

    // Stop the browser's right-click menu, and the middle-click "autoscroll", over the game.
    scene.input.mouse?.disableContextMenu();
    scene.game.canvas.addEventListener('mousedown', preventMiddleClick);

    // Mouse buttons: find which action (if any) is bound to the button that was pressed.
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (IS_TOUCH) return; // touches are handled by the on-screen controls
      const button = MOUSE_BUTTONS[[0, 1, 2].indexOf(p.button)];
      for (const action of PRESS_ACTIONS) if (getControlSettings().bindings[action] === button) this.pressed.add(action);
    });

    this.bindKeys();
    // The player changed their bindings on the Controls screen: rebuild the keys.
    const rebind = () => this.bindKeys();
    scene.game.events.on(CONTROLS_CHANGED, rebind);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.game.events.off(CONTROLS_CHANGED, rebind);
      scene.game.canvas.removeEventListener('mousedown', preventMiddleClick);
    });
  }

  /** (Re)create a Phaser Key for every keyboard binding. Mouse bindings need no Key. */
  private bindKeys(): void {
    const kb = this.scene.input.keyboard!;
    for (const key of Object.values(this.keys)) if (key) kb.removeKey(key, true);
    this.keys = {};
    const bindings = getControlSettings().bindings;
    for (const [action, binding] of Object.entries(bindings) as [ActionId, string][]) {
      if (binding.startsWith('MOUSE_')) continue;
      const key = kb.addKey(binding);
      this.keys[action] = key;
      if (PRESS_ACTIONS.includes(action)) key.on('down', () => this.pressed.add(action));
    }
  }

  /** Is the action's key or mouse button held down right now? */
  private isDown(action: ActionId): boolean {
    const binding = getControlSettings().bindings[action];
    const p = this.scene.input.activePointer;
    if (binding === 'MOUSE_LEFT') return !IS_TOUCH && p.leftButtonDown();
    if (binding === 'MOUSE_RIGHT') return !IS_TOUCH && p.rightButtonDown();
    if (binding === 'MOUSE_MIDDLE') return !IS_TOUCH && p.middleButtonDown();
    return this.keys[action]?.isDown ?? false;
  }

  /** True if `name` was pressed since the last read(). */
  private took(name: string): boolean {
    return this.pressed.has(name);
  }

  /** Read all input for this frame. Call exactly once per frame. */
  read(): PlayerInput {
    const i = this.input;
    const f = this.fixed;

    // Movement: normalize so diagonals aren't ~41% faster than straight lines.
    const x = (this.isDown('right') || f.RIGHT.isDown ? 1 : 0) - (this.isDown('left') || f.LEFT.isDown ? 1 : 0);
    const y = (this.isDown('down') || f.DOWN.isDown ? 1 : 0) - (this.isDown('up') || f.UP.isDown ? 1 : 0);
    i.move.set(x, y).normalize();

    // Convert the mouse's screen position into a world position. We do this
    // every frame because the camera may scroll even when the mouse is still.
    const pointer = this.scene.input.activePointer;
    const world = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    i.aimWorld.set(world.x, world.y);

    i.attack = this.took('attack');
    i.attackHeld = this.isDown('attack');
    i.dodge = this.took('dodge');
    i.skill = this.took('skill');
    i.chain = this.took('chain');
    i.switchNext = this.took('swap');
    i.select = this.took('one') ? 0 : this.took('two') ? 1 : this.took('three') ? 2 : -1;
    i.potionHealth = this.took('potionHp');
    i.potionMana = this.took('potionMp');
    i.pause = this.took('pause');

    i.autoAim = false;
    const touch = IS_TOUCH ? stageTouch.current : null;
    if (touch) this.mergeTouch(touch);

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

function preventMiddleClick(e: MouseEvent): void {
  if (e.button === 1) e.preventDefault();
}
