import Phaser from 'phaser';
import { DEPTH } from '../config';
import type { StickMode } from '../systems/ControlSettings';

/** Optional look & feel (from the player's Controls settings). */
export interface TouchOptions {
  /** Button fill opacity, 0.2 - 0.9. */
  opacity?: number;
  /** floating = appears under your thumb; fixed = always at (x, y). */
  stickMode?: StickMode;
  stickX?: number;
  stickY?: number;
  /** Joystick size multiplier. */
  stickScale?: number;
}

/** One round on-screen button. Positions are in screen pixels (960 x 540 game space). */
export interface TouchButtonDef {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  color: number;
}

interface TouchButton {
  def: TouchButtonDef;
  gfx: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  visible: boolean;
  /** 0 = ready, 1 = just used (draws a dark pie like the desktop icons). */
  cooldown: number;
  /** Greyed out (e.g. not enough mana / no potions). Still pressable. */
  dim: boolean;
}

/** How far (px) the joystick knob can move from its center. */
const STICK_RADIUS = 52;
/** Below this fraction of the radius, the stick counts as "not pushed". */
const DEAD_ZONE = 0.22;

/**
 * TOUCH CONTROLS for phones and tablets.
 *
 *   - Joystick, two modes (chosen on the Controls screen):
 *       floating: put your thumb anywhere in `stickArea`; the stick appears under it.
 *       fixed:    the stick always sits in the same spot; touch it and drag.
 *   - Round buttons: press = one "tap" event (read with took()), and while the
 *     finger stays down the button counts as held (isHeld()).
 *
 * Several fingers work at once (joystick + attack + skill), because every
 * finger has its own pointer id and we remember which finger owns what.
 *
 * Instead of Phaser's interactive objects we hit-test the circles ourselves:
 * it keeps multi-touch simple and works the same in every scene.
 */
export class TouchControls {
  /** Joystick direction: length 0 (not pushed) or 1. */
  readonly move = new Phaser.Math.Vector2();
  /** When false, touches are ignored and everything is hidden (e.g. a menu is open). */
  private enabled = true;

  private readonly buttons = new Map<string, TouchButton>();
  /** Which finger (pointer id) is holding which button. */
  private readonly held = new Map<string, number>();
  /** Buttons pressed since the last consume(). */
  private readonly pressed = new Set<string>();

  private stickPointer: number | null = null;
  private readonly opacity: number;
  private readonly stickMode: StickMode;
  private readonly stickRadius: number;
  /** Where the stick rests: the fixed position, or the hint spot in floating mode. */
  private readonly stickHome = new Phaser.Math.Vector2();
  private readonly stickCenter = new Phaser.Math.Vector2();
  private readonly stickGfx: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    defs: TouchButtonDef[],
    private readonly stickArea: Phaser.Geom.Rectangle,
    options: TouchOptions = {},
  ) {
    this.opacity = options.opacity ?? 0.4;
    this.stickMode = options.stickMode ?? 'floating';
    this.stickRadius = STICK_RADIUS * (options.stickScale ?? 1);
    this.stickHome.set(options.stickX ?? stickArea.x + 110, options.stickY ?? stickArea.bottom - 100);
    this.stickGfx = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.ui - 5);
    for (const def of defs) {
      const gfx = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.ui - 5);
      const size = def.r > 30 ? 15 : 11;
      const label = scene.add
        .text(def.x, def.y, def.label, { fontFamily: 'monospace', fontSize: `${size}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#1a1422', strokeThickness: 3, align: 'center' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.ui - 4);
      const sub = scene.add
        .text(def.x, def.y + def.r * 0.5, '', { fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold', color: '#ffffff', stroke: '#1a1422', strokeThickness: 3 })
        .setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH.ui - 4);
      this.buttons.set(def.id, { def, gfx, label, sub, visible: true, cooldown: 0, dim: false });
    }

    const input = scene.input;
    input.on('pointerdown', this.onDown, this);
    input.on('pointermove', this.onMove, this);
    input.on('pointerup', this.onUp, this);
    input.on('pointerupoutside', this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      input.off('pointerdown', this.onDown, this);
      input.off('pointermove', this.onMove, this);
      input.off('pointerup', this.onUp, this);
      input.off('pointerupoutside', this.onUp, this);
    });
    this.redraw();
  }

  // ---------------------------------------------------------------------------
  // Reading (used by Controls / HubScene)
  // ---------------------------------------------------------------------------

  /** True if the button was tapped since the last consume(). */
  took(id: string): boolean {
    return this.pressed.has(id);
  }

  /** True while a finger is on the button. */
  isHeld(id: string): boolean {
    return this.held.has(id);
  }

  /** Remove the buttons and stop listening (used to rebuild them with a new layout). */
  destroy(): void {
    const input = this.scene.input;
    input.off('pointerdown', this.onDown, this);
    input.off('pointermove', this.onMove, this);
    input.off('pointerup', this.onUp, this);
    input.off('pointerupoutside', this.onUp, this);
    this.stickGfx.destroy();
    for (const b of this.buttons.values()) {
      b.gfx.destroy();
      b.label.destroy();
      b.sub.destroy();
    }
    this.buttons.clear();
  }

  /** Count a tap from elsewhere (e.g. tapping a party row in the HUD). */
  tap(id: string): void {
    if (this.enabled) this.pressed.add(id);
  }

  /** Forget the taps that were just read. Call once per frame after reading. */
  consume(): void {
    this.pressed.clear();
  }

  // ---------------------------------------------------------------------------
  // Showing state (cooldowns, counts...)
  // ---------------------------------------------------------------------------

  setButton(id: string, state: { visible?: boolean; cooldown?: number; dim?: boolean; sub?: string; label?: string }): void {
    const b = this.buttons.get(id);
    if (!b) return;
    if (state.visible !== undefined) b.visible = state.visible;
    if (state.cooldown !== undefined) b.cooldown = Phaser.Math.Clamp(state.cooldown, 0, 1);
    if (state.dim !== undefined) b.dim = state.dim;
    if (state.sub !== undefined) b.sub.setText(state.sub);
    if (state.label !== undefined) b.label.setText(state.label);
    if (!b.visible) this.held.delete(id);
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) this.releaseAll();
  }

  /** Redraw every button. Call once per frame after setButton(). */
  redraw(): void {
    for (const [id, b] of this.buttons) {
      const show = this.enabled && b.visible;
      const { x, y, r, color } = b.def;
      const g = b.gfx.clear().setVisible(show);
      b.label.setVisible(show);
      b.sub.setVisible(show);
      if (!show) continue;
      const down = this.held.has(id);
      const a = this.opacity;
      g.fillStyle(b.dim ? 0x3a3446 : color, down ? Math.min(1, a + 0.35) : a).fillCircle(x, y, r);
      g.lineStyle(2, 0xffffff, down ? 0.9 : Math.min(1, a + 0.15)).strokeCircle(x, y, r);
      if (b.cooldown > 0) {
        const start = -Math.PI / 2;
        g.fillStyle(0x000000, 0.55);
        g.slice(x, y, r, start, start + Math.PI * 2 * b.cooldown, false).fillPath();
      }
      b.label.setAlpha((b.dim ? 0.6 : 1) * Math.min(1, this.opacity + 0.45));
      b.sub.setAlpha(Math.min(1, this.opacity + 0.45));
    }

    // Joystick: a ring where the thumb went down + a knob under the thumb.
    const g = this.stickGfx.clear();
    if (!this.enabled) return;
    const R = this.stickRadius;
    const knobR = R * 0.42;
    if (this.stickPointer !== null) {
      const c = this.stickCenter;
      g.fillStyle(0xffffff, 0.08 + this.opacity * 0.1).fillCircle(c.x, c.y, R);
      g.lineStyle(2, 0xffffff, 0.35).strokeCircle(c.x, c.y, R);
      g.fillStyle(0xffffff, 0.45).fillCircle(c.x + this.knob.x, c.y + this.knob.y, knobR);
    } else {
      // Where the stick rests (fixed mode), or a faint hint of where it usually appears (floating).
      const fixed = this.stickMode === 'fixed';
      const h = this.stickHome;
      g.fillStyle(0xffffff, fixed ? 0.06 + this.opacity * 0.1 : 0).fillCircle(h.x, h.y, R);
      g.lineStyle(2, 0xffffff, fixed ? 0.3 : 0.12).strokeCircle(h.x, h.y, R);
      g.fillStyle(0xffffff, fixed ? 0.3 : 0.1).fillCircle(h.x, h.y, knobR);
    }
  }

  // ---------------------------------------------------------------------------
  // Pointer handling
  // ---------------------------------------------------------------------------

  private readonly knob = new Phaser.Math.Vector2();

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[] = []): void {
    if (!this.enabled) return;
    // 1. A button under the finger? (A little bigger than drawn: fingers are fat.)
    for (const [id, b] of this.buttons) {
      if (!b.visible) continue;
      if (Phaser.Math.Distance.Between(p.x, p.y, b.def.x, b.def.y) <= b.def.r * 1.15) {
        this.held.set(id, p.id);
        this.pressed.add(id);
        return;
      }
    }
    // 2. Otherwise maybe start the joystick, unless the finger landed on something tappable (a menu, a HUD row).
    if (over.length > 0 || this.stickPointer !== null) return;
    if (this.stickMode === 'fixed') {
      // Fixed: you must touch the stick itself (a bit of slack around it).
      if (Phaser.Math.Distance.Between(p.x, p.y, this.stickHome.x, this.stickHome.y) > this.stickRadius * 1.6) return;
      this.stickCenter.copy(this.stickHome);
    } else {
      if (!Phaser.Geom.Rectangle.Contains(this.stickArea, p.x, p.y)) return;
      this.stickCenter.set(p.x, p.y);
    }
    this.stickPointer = p.id;
    this.knob.set(0, 0);
    this.move.set(0, 0);
    if (this.stickMode === 'fixed') this.onMove(p); // a touch off-center already pushes the stick
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.stickPointer) return;
    this.knob.set(p.x - this.stickCenter.x, p.y - this.stickCenter.y);
    const len = this.knob.length();
    if (len > this.stickRadius) this.knob.scale(this.stickRadius / len);
    // Past the dead zone = full speed in that direction (like the keyboard).
    if (len < this.stickRadius * DEAD_ZONE) this.move.set(0, 0);
    else this.move.copy(this.knob).normalize();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    for (const [id, pid] of this.held) if (pid === p.id) this.held.delete(id);
    if (p.id === this.stickPointer) {
      this.stickPointer = null;
      this.move.set(0, 0);
    }
  }

  private releaseAll(): void {
    this.held.clear();
    this.pressed.clear();
    this.stickPointer = null;
    this.move.set(0, 0);
    this.redraw();
  }
}

/**
 * The touch controls of the running stage. UIScene creates them; the stage's
 * Controls reads them. (A tiny shared "mailbox" between the two scenes.)
 */
export const stageTouch: { current: TouchControls | null } = { current: null };
