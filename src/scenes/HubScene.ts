import Phaser from 'phaser';
import { COLORS, DEPTH, GAME_HEIGHT, GAME_WIDTH, IS_TOUCH, TILE } from '../config';
import { TouchControls } from '../ui/TouchControls';
import { CONTROLS_CHANGED, getControlSettings } from '../systems/ControlSettings';
import { HUB_NPCS, HUB_ROOM, type NpcDef } from '../data/hub';
import { buildRoom, tileCenter } from '../systems/RoomBuilder';
import { getSave, saveGame, getParty } from '../systems/SaveData';
import { ShopPanel } from '../ui/ShopPanel';
import { PartyPanel } from '../ui/PartyPanel';
import { FONT, type Panel, type PanelKey } from '../ui/Panel';
import { DialogueBox } from '../ui/DialogueBox';
import { Button } from '../ui/Panel';
import type { PauseData } from './PauseScene';
import { Sfx } from '../systems/Sfx';

const WALK_SPEED = 170;
/** How close (px) you must stand to an NPC to talk. */
const TALK_RANGE = 72;
/** Followers walk this many "breadcrumbs" behind the leader. */
const FOLLOW_GAP = 10;

interface Npc {
  def: NpcDef;
  sprite: Phaser.GameObjects.Image;
  lineIndex: number;
}

/**
 * HubScene: Emberwick, the safe town between stages. No combat here.
 *
 *   - Walk around with WASD / arrows; your party follows you.
 *   - Stand next to someone and press E to talk (typewriter dialogue box).
 *   - Tilda = shop, Gatekeeper Orin = Stage Select, Elder Bram = party setup.
 *   - Tab opens the party setup from anywhere.
 *
 * The heroes here are simple sprites (not full Hero entities): they only walk.
 */
export class HubScene extends Phaser.Scene {
  private leader!: Phaser.Physics.Arcade.Image;
  private followers: Phaser.GameObjects.Image[] = [];
  private shadows: Phaser.GameObjects.Image[] = [];
  /** Recent leader positions. Followers walk along this trail. */
  private trail: Phaser.Math.Vector2[] = [];
  private npcs: Npc[] = [];
  private prompt!: Phaser.GameObjects.Text;
  private nearNpc: Npc | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private panel: Panel | null = null;
  private shop!: ShopPanel;
  private partyPanel!: PartyPanel;
  private coinText!: Phaser.GameObjects.Text;
  private dialogue!: DialogueBox;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  /** Phones only: joystick + TALK / PARTY buttons. */
  private touch: TouchControls | null = null;
  private leaving = false;
  private walkTime = 0;

  constructor() {
    super('Hub');
  }

  create(): void {
    this.leader = undefined!; // the old one was destroyed with the previous scene run
    this.followers = [];
    this.shadows = [];
    this.trail = [];
    this.npcs = [];
    this.panel = null;
    this.leaving = false;
    saveGame(); // arriving in town is a good moment to save

    this.cameras.main.setBackgroundColor(COLORS.background);
    const built = buildRoom(this, HUB_ROOM);
    this.physics.world.setBounds(0, 0, built.widthPx, built.heightPx);
    this.drawDecorations();

    // --- Party ---
    this.layer = built.layer;
    const spawn = built.playerSpawn ?? new Phaser.Math.Vector2(built.widthPx / 2, built.heightPx / 2);
    this.buildParty(spawn.x, spawn.y);

    // --- NPCs ---
    for (const def of HUB_NPCS) {
      const p = tileCenter(def.tx, def.ty);
      this.add.image(p.x, p.y + 2, 'shadow').setDepth(DEPTH.shadows);
      const sprite = this.add.image(p.x, p.y, `npc-${def.id}`).setOrigin(0.5, 0.92).setDepth(DEPTH.entities + p.y);
      // Idle bob so the town feels alive.
      this.tweens.add({ targets: sprite, scaleY: 1.04, duration: 900 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.add.text(p.x, p.y - 44, def.name, { fontFamily: FONT, fontSize: '11px', color: COLORS.uiAccent, stroke: '#1a1422', strokeThickness: 3 })
        .setOrigin(0.5).setDepth(DEPTH.effects);
      this.npcs.push({ def, sprite, lineIndex: 0 });
    }

    // "[E] Shop" prompt that appears over the nearest NPC.
    this.prompt = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 6, y: 3 } })
      .setOrigin(0.5).setDepth(DEPTH.effects).setVisible(false);

    // --- Camera ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, built.widthPx, built.heightPx);
    cam.fadeIn(300, 0, 0, 0);

    // --- HUD: town name, coins, potions, help ---
    this.add.text(16, 12, 'EMBERWICK', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: COLORS.uiAccent })
      .setScrollFactor(0).setDepth(DEPTH.ui - 1);
    this.coinText = this.add.text(16, 40, '', { fontFamily: FONT, fontSize: '14px', color: '#ffd23f' })
      .setScrollFactor(0).setDepth(DEPTH.ui - 1);
    this.add.text(GAME_WIDTH - 16, GAME_HEIGHT - 14, IS_TOUCH ? 'Left thumb: walk    TALK: speak    PARTY: party setup' : 'WASD: walk    E: talk    Tab: party setup    Esc: menu', { fontFamily: FONT, fontSize: '12px', color: COLORS.uiText })
      .setOrigin(1, 1).setScrollFactor(0).setDepth(DEPTH.ui - 1).setAlpha(0.7);

    // --- Panels ---
    this.shop = new ShopPanel(this);
    this.partyPanel = new PartyPanel(this);
    for (const p of [this.shop, this.partyPanel]) p.onClose = () => (this.panel = null);
    this.partyPanel.onPartyChanged = () => this.buildParty(this.leader.x, this.leader.y);
    this.dialogue = new DialogueBox(this);
    // Menu (same menu as in a stage): Controls, Log out, Quit to title, Sound.
    new Button(this, GAME_WIDTH - 60, 24, 'Menu', () => this.openMenu(), 90, 30, 0xc9bde0)
      .setScrollFactor(0, 0, true).setDepth(DEPTH.ui - 1);
    this.touch = this.makeTouch();

    // --- Keys ---
    const kb = this.input.keyboard!;
    this.bindWalkKeys();
    // Walking keys follow the player's bindings (changed from the menu's Controls screen).
    const rebind = () => {
      this.bindWalkKeys();
      if (this.touch) {
        // New touch layout: rebuild the joystick / buttons.
        this.touch.destroy();
        this.touch = this.makeTouch();
      }
    };
    this.game.events.on(CONTROLS_CHANGED, rebind);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(CONTROLS_CHANGED, rebind));
    const press = (key: PanelKey) => this.onPress(key);
    kb.on('keydown-E', () => press('confirm'));
    kb.on('keydown-ENTER', () => press('confirm'));
    kb.on('keydown-SPACE', () => press('confirm'));
    kb.on('keydown-ESC', () => press('back'));
    kb.on('keydown-W', () => press('up'));
    kb.on('keydown-UP', () => press('up'));
    kb.on('keydown-S', () => press('down'));
    kb.on('keydown-DOWN', () => press('down'));
    kb.on('keydown-A', () => press('left'));
    kb.on('keydown-LEFT', () => press('left'));
    kb.on('keydown-D', () => press('right'));
    kb.on('keydown-RIGHT', () => press('right'));
    kb.on('keydown-Q', () => press('alt'));
    kb.on('keydown-TAB', (e: KeyboardEvent) => {
      e.preventDefault(); // stop the browser moving focus away from the game
      if (this.panel === this.partyPanel) this.partyPanel.close();
      else if (!this.panel) this.openPanel(this.partyPanel);
    });
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    this.coinText.setText(`Coins ${getSave().coins}    Potions  HP x${getSave().potions.health}  MP x${getSave().potions.mana}`);

    // --- Walking (frozen while a panel is open or while leaving) ---
    const k = this.keys;
    const busy = !!this.panel || this.leaving || this.dialogue.isOpen;
    this.dialogue.update(dt);
    const down = (name: string) => k[name]?.isDown ?? false;
    const dir = new Phaser.Math.Vector2(
      busy ? 0 : (down('right') || down('RIGHT') ? 1 : 0) - (down('left') || down('LEFT') ? 1 : 0),
      busy ? 0 : (down('down') || down('DOWN') ? 1 : 0) - (down('up') || down('UP') ? 1 : 0),
    ).normalize();
    if (this.touch) this.updateTouch(dir, busy);
    this.leader.setVelocity(dir.x * WALK_SPEED, dir.y * WALK_SPEED);
    if (dir.x !== 0) this.leader.setFlipX(dir.x < 0);

    // Walk hop (visual only).
    const moving = dir.lengthSq() > 0;
    this.walkTime = moving ? this.walkTime + dt : 0;
    this.leader.setScale(1, moving ? 1 - Math.abs(Math.sin(this.walkTime * 14)) * 0.06 : 1);

    // Breadcrumb trail: drop a point every few pixels the leader moves.
    const last = this.trail[0];
    if (!last || Phaser.Math.Distance.Between(last.x, last.y, this.leader.x, this.leader.y) > 4) {
      this.trail.unshift(new Phaser.Math.Vector2(this.leader.x, this.leader.y));
      this.trail.length = Math.min(this.trail.length, FOLLOW_GAP * (this.followers.length + 1) + 1);
    }
    this.followers.forEach((f, i) => {
      const spot = this.trail[Math.min(this.trail.length - 1, FOLLOW_GAP * (i + 1))];
      if (!spot) return;
      if (Math.abs(spot.x - f.x) > 0.5) f.setFlipX(spot.x < f.x);
      f.x = Phaser.Math.Linear(f.x, spot.x, 0.25);
      f.y = Phaser.Math.Linear(f.y, spot.y, 0.25);
    });

    // Shadows + depth sorting (lower on screen = drawn in front).
    const bodies = [this.leader, ...this.followers];
    bodies.forEach((b, i) => {
      this.shadows[i].setPosition(b.x, b.y + 1);
      b.setDepth(DEPTH.entities + b.y);
    });

    this.updatePrompt();
  }

  /** Movement keys: the player's bindings (up/down/left/right) plus the arrow keys. */
  private bindWalkKeys(): void {
    const kb = this.input.keyboard!;
    if (this.keys) for (const key of Object.values(this.keys)) kb.removeKey(key, true);
    const b = getControlSettings().bindings;
    this.keys = {};
    for (const action of ['up', 'down', 'left', 'right'] as const) {
      if (!b[action].startsWith('MOUSE_')) this.keys[action] = kb.addKey(b[action]);
    }
    for (const arrow of ['UP', 'DOWN', 'LEFT', 'RIGHT']) this.keys[arrow] = kb.addKey(arrow);
  }

  private makeTouch(): TouchControls | null {
    if (!IS_TOUCH) return null;
    return new TouchControls(
      this,
      [
        { id: 'talk', x: GAME_WIDTH - 92, y: GAME_HEIGHT - 100, r: 48, label: 'TALK', color: 0xffcf5a },
        { id: 'party', x: GAME_WIDTH - 70, y: GAME_HEIGHT - 220, r: 30, label: 'PARTY', color: 0xc9bde0 },
      ],
      new Phaser.Geom.Rectangle(0, 70, GAME_WIDTH * 0.5, GAME_HEIGHT - 70),
      this.stickOptions(),
    );
  }

  private stickOptions() {
    const t = getControlSettings().touch;
    return { opacity: t.opacity, stickMode: t.stickMode, stickX: t.stick.x, stickY: t.stick.y, stickScale: t.stick.scale };
  }

  /** Phones: joystick walks; TALK talks; PARTY opens party setup. Hidden while a window is open. */
  private updateTouch(dir: Phaser.Math.Vector2, busy: boolean): void {
    const t = this.touch!;
    t.setEnabled(!this.panel && !this.leaving);
    if (!busy && dir.lengthSq() === 0) dir.copy(t.move);
    if (t.took('talk')) this.onPress('confirm');
    if (t.took('party') && !this.panel && !this.dialogue.isOpen) this.openPanel(this.partyPanel);
    t.consume();
    t.setButton('talk', { visible: !!this.nearNpc && !this.dialogue.isOpen });
    t.setButton('party', { visible: !this.dialogue.isOpen });
    t.redraw();
  }

  /** Show "[E] action" over the closest NPC in range. */
  private updatePrompt(): void {
    let best: Npc | null = null;
    let bestDist = TALK_RANGE;
    for (const npc of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.leader.x, this.leader.y, npc.sprite.x, npc.sprite.y);
      if (d < bestDist) {
        best = npc;
        bestDist = d;
      }
    }
    this.nearNpc = best;
    const show = !!best && !this.panel && !this.leaving && !this.dialogue.isOpen;
    this.prompt.setVisible(show);
    if (show && best) this.prompt.setText(IS_TOUCH ? best.def.action : `[E] ${best.def.action}`).setPosition(best.sprite.x, best.sprite.y + 14);
  }

  private onPress(key: PanelKey): void {
    if (this.leaving) return;
    if (this.dialogue.isOpen) {
      if (key === 'confirm' || key === 'back') this.dialogue.advance();
      return;
    }
    if (this.panel) {
      this.panel.handleKey(key);
      return;
    }
    if (key === 'confirm' && this.nearNpc) this.talkTo(this.nearNpc);
    if (key === 'back') this.openMenu(); // Esc with nothing open = menu
  }

  /**
   * Talk: the NPC says a line in the dialogue box (typewriter effect).
   * When you close it, the NPC does its job: open the shop, the party setup,
   * or take you to Stage Select. "talk" NPCs say a new line each time.
   */
  private talkTo(npc: Npc): void {
    const def = npc.def;
    const line = def.lines[npc.lineIndex % def.lines.length];
    npc.lineIndex++;
    Sfx.play('uiConfirm');
    this.tweens.add({ targets: npc.sprite, y: npc.sprite.y - 6, duration: 90, yoyo: true });

    this.dialogue.show(def.name, [line], () => {
      if (def.kind === 'shop') this.openPanel(this.shop);
      else if (def.kind === 'party') this.openPanel(this.partyPanel);
      else if (def.kind === 'stages') this.goTo('StageSelect');
    });
  }

  /**
   * Create the walking party from the save file: the leader has a physics body,
   * the others follow its trail. Called again when the party setup changes.
   */
  private buildParty(x: number, y: number): void {
    this.leader?.destroy();
    this.followers.forEach((f) => f.destroy());
    this.shadows.forEach((s) => s.destroy());
    this.followers = [];
    this.shadows = [];
    this.trail = [];
    getParty().forEach((id, i) => {
      this.shadows.push(this.add.image(x, y, 'shadow').setDepth(DEPTH.shadows));
      if (i === 0) {
        this.leader = this.physics.add.image(x, y, `hero-${id}`).setOrigin(0.5, 0.92);
        this.leader.body!.setSize(18, 10).setOffset(7, 26);
        this.physics.add.collider(this.leader, this.layer);
        this.cameras.main.startFollow(this.leader, true, 0.12, 0.12);
      } else {
        this.followers.push(this.add.image(x, y + i * 10, `hero-${id}`).setOrigin(0.5, 0.92));
      }
    });
  }

  /** Pause the town and show the menu on top. */
  private openMenu(): void {
    if (this.leaving || this.panel || this.dialogue.isOpen) return;
    Sfx.play('uiConfirm');
    this.leader.setVelocity(0, 0);
    this.scene.pause();
    this.scene.launch('Pause', { from: 'Hub' } satisfies PauseData);
  }

  private openPanel(panel: Panel): void {
    this.panel = panel;
    Sfx.play('uiConfirm');
    panel.open();
  }

  private goTo(scene: string): void {
    this.leaving = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  /** Placeholder town art drawn with shapes: shop stall, town gate, fountain, flowers. */
  private drawDecorations(): void {
    const g = this.add.graphics().setDepth(DEPTH.shadows - 1);
    // Shop awning over the counter (counter = the 'ooooo' row at tiles 4-8, row 4).
    const shopX = 4 * TILE;
    const shopY = 4 * TILE;
    for (let i = 0; i < 10; i++) {
      g.fillStyle(i % 2 ? 0xc77dff : 0xf4ecff).fillRect(shopX - 8 + i * 17.6, shopY - 70, 17.6, 18);
    }
    g.fillStyle(0x6b4a2a).fillRect(shopX - 8, shopY - 52, 6, 52).fillRect(shopX + 5 * TILE + 2, shopY - 52, 6, 52);
    // Town gate in the top wall, behind Orin.
    const gx = 27 * TILE;
    g.fillStyle(0x1a1422).fillRect(gx, 0, 3 * TILE, TILE + 6);
    g.fillStyle(0x0a0710).fillRect(gx + 10, 4, 3 * TILE - 20, TILE + 2);
    g.lineStyle(4, 0xffcf5a, 0.8).strokeRect(gx + 2, 2, 3 * TILE - 4, TILE + 4);
    // Fountain water around the 2x2 pillar block.
    g.fillStyle(0x4a8fe0, 0.5).fillCircle(18 * TILE, 10 * TILE, 52);
    g.fillStyle(0xbfe6ff, 0.35).fillCircle(18 * TILE, 10 * TILE, 40);
    // Flowers
    const rng = new Phaser.Math.RandomDataGenerator(['emberwick']);
    for (let i = 0; i < 40; i++) {
      const fx = rng.between(2 * TILE, 33 * TILE);
      const fy = rng.between(6 * TILE, 18 * TILE);
      g.fillStyle(rng.pick([0xff7a5a, 0xffd23f, 0x8fd16a, 0xff7af0]), 0.7).fillCircle(fx, fy, 2);
    }
    // Sign posts
    this.add.text(28.5 * TILE, TILE + 10, 'TO THE WILDS', { fontFamily: FONT, fontSize: '10px', color: COLORS.uiAccent })
      .setOrigin(0.5, 0).setDepth(DEPTH.shadows);
  }
}
