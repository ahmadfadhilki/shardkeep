import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, IS_TOUCH } from '../config';
import {
  ACTIONS,
  bindingLabel,
  getControlSettings,
  keyNameFromEvent,
  MOUSE_BUTTONS,
  RESERVED_KEYS,
  resetBindings,
  resetTouchLayout,
  saveControlSettings,
  TOUCH_BUTTONS,
  type ActionId,
  type ControlSettings,
} from '../systems/ControlSettings';
import { Sfx } from '../systems/Sfx';
import { Button, FONT } from '../ui/Panel';

export interface ControlsSceneData {
  /** Where to go back to: 'Pause' (it's sleeping under us) or 'Title'. */
  from: 'Pause' | 'Title';
}

/** Something draggable in the touch layout editor. */
type EditTarget = { kind: 'button'; id: string } | { kind: 'stick' };

/**
 * CONTROLS SCREEN
 *
 * Laptop/desktop: a list of actions. Click a binding, then press the key or
 *   mouse button you want. If another action already uses it, they swap.
 *
 * Phone/tablet: a layout editor. Drag any button (or the joystick) where your
 *   thumbs like it, tap one and use Size - / Size + to resize it, pick the
 *   joystick mode (Floating / Fixed) and how see-through the buttons are.
 *
 * "Save" keeps the changes (stored on this device); "Cancel" throws them away.
 */
export class ControlsScene extends Phaser.Scene {
  private from: ControlsSceneData['from'] = 'Title';
  /** Copy of the settings when we opened, for Cancel. */
  private backup!: ControlSettings;
  private message!: Phaser.GameObjects.Text;

  // Desktop rebinding
  private rows: { id: ActionId; button: Button }[] = [];
  private waitingFor: ActionId | null = null;
  private waitStart = 0;

  // Touch layout editor
  private gfx!: Phaser.GameObjects.Graphics;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private selected: EditTarget | null = null;
  private dragging: { target: EditTarget; dx: number; dy: number } | null = null;
  private stickModeButton!: Button;
  private opacityButton!: Button;

  constructor() {
    super('Controls');
  }

  init(data: ControlsSceneData): void {
    this.from = data?.from ?? 'Title';
    this.backup = JSON.parse(JSON.stringify(getControlSettings())) as ControlSettings;
    this.rows = [];
    this.labels = new Map();
    this.selected = null;
    this.dragging = null;
    this.waitingFor = null;
  }

  create(): void {
    this.input.setDefaultCursor('default');
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0d0a12, 0.97);
    if (IS_TOUCH) this.createTouchEditor();
    else this.createKeyList();
  }

  // ===========================================================================
  // Desktop: rebind keys
  // ===========================================================================

  private createKeyList(): void {
    this.add.text(GAME_WIDTH / 2, 26, 'CONTROLS', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: COLORS.uiAccent }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 54, 'Click a key, then press the new key or mouse button. Esc cancels.', {
      fontFamily: FONT, fontSize: '12px', color: COLORS.uiText,
    }).setOrigin(0.5).setAlpha(0.75);

    ACTIONS.forEach((action, i) => {
      const y = 86 + i * 32;
      this.add.text(GAME_WIDTH / 2 - 40, y, action.label, { fontFamily: FONT, fontSize: '15px', color: COLORS.uiText }).setOrigin(1, 0.5);
      const button = new Button(this, GAME_WIDTH / 2 + 80, y, '', () => this.startWaiting(action.id), 160, 26);
      this.rows.push({ id: action.id, button });
    });

    this.add.text(GAME_WIDTH / 2, 442, 'Always: arrow keys move   1 / 2 / 3 pick a hero   R reset room   Esc menu   M sound', {
      fontFamily: FONT, fontSize: '12px', color: '#c9bde0',
    }).setOrigin(0.5);
    this.message = this.add.text(GAME_WIDTH / 2, 466, '', { fontFamily: FONT, fontSize: '13px', color: '#b8f27a' }).setOrigin(0.5);

    new Button(this, GAME_WIDTH / 2 - 200, 505, 'Reset to defaults', () => {
      resetBindings();
      this.refreshKeys();
      this.say('Back to the default keys. Press Save to keep them.');
    }, 190, 32, 0xc9bde0);
    new Button(this, GAME_WIDTH / 2 + 10, 505, 'Cancel', () => this.close(false), 120, 32, 0xc9bde0);
    new Button(this, GAME_WIDTH / 2 + 160, 505, 'Save', () => this.close(true), 140, 32, 0x8fd16a);

    // Keyboard: the next key pressed becomes the binding (while waiting).
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    // Mouse: the next click becomes the binding (while waiting).
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.waitingFor || performance.now() < this.waitStart) return; // ignore the click that started waiting
      this.assign(MOUSE_BUTTONS[[0, 1, 2].indexOf(p.button)]);
    });
    this.refreshKeys();
  }

  private startWaiting(id: ActionId): void {
    this.waitingFor = id;
    this.waitStart = performance.now() + 120;
    Sfx.play('uiConfirm');
    this.refreshKeys();
    this.say(`Press a key or mouse button for "${ACTIONS.find((a) => a.id === id)!.label}"...`, '#ffcf5a');
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.waitingFor) {
      if (e.key === 'Escape') this.close(false);
      return;
    }
    e.preventDefault(); // e.g. Tab shouldn't move the browser's focus
    if (e.key === 'Escape') {
      this.waitingFor = null;
      this.refreshKeys();
      this.say('Cancelled.');
      return;
    }
    const name = keyNameFromEvent(e);
    if (!name) return this.say("That key can't be used, sorry.", '#ff9b9b');
    this.assign(name);
  }

  /** Give the waiting action this key / mouse button. If another action had it, they swap. */
  private assign(binding: string): void {
    const action = this.waitingFor;
    if (!action) return;
    if (RESERVED_KEYS.includes(binding)) {
      Sfx.play('uiError');
      return this.say(`${bindingLabel(binding)} is reserved (it always does the same thing). Pick another.`, '#ff9b9b');
    }
    const bindings = getControlSettings().bindings;
    const old = bindings[action];
    const other = (Object.keys(bindings) as ActionId[]).find((a) => a !== action && bindings[a] === binding);
    bindings[action] = binding;
    if (other) bindings[other] = old; // swap so every action still has a key
    this.waitingFor = null;
    Sfx.play('uiConfirm');
    this.refreshKeys();
    const label = (id: ActionId) => ACTIONS.find((a) => a.id === id)!.label;
    this.say(other ? `Swapped: ${label(action)} = ${bindingLabel(binding)}, ${label(other)} = ${bindingLabel(old)}` : `${label(action)} = ${bindingLabel(binding)}`);
  }

  private refreshKeys(): void {
    const b = getControlSettings().bindings;
    for (const row of this.rows) {
      const waiting = this.waitingFor === row.id;
      row.button.setText(waiting ? 'press a key...' : bindingLabel(b[row.id])).setHighlight(waiting);
    }
  }

  // ===========================================================================
  // Phone: touch layout editor
  // ===========================================================================

  private createTouchEditor(): void {
    // A faint picture of the screen edges and the party rows, so you can see what's covered.
    const frame = this.add.graphics();
    frame.lineStyle(1, 0xffffff, 0.15).strokeRect(1, 1, GAME_WIDTH - 2, GAME_HEIGHT - 2);
    frame.fillStyle(0xffffff, 0.05).fillRoundedRect(10, 8, 176, 98, 6);
    this.add.text(98, 57, 'party rows', { fontFamily: FONT, fontSize: '11px', color: COLORS.uiText }).setOrigin(0.5).setAlpha(0.4);

    this.gfx = this.add.graphics();
    for (const d of TOUCH_BUTTONS) {
      this.labels.set(d.id, this.add.text(0, 0, d.label, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    }
    this.labels.set('stick', this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', color: '#ffffff', align: 'center' }).setOrigin(0.5));

    // Toolbar
    const y = 150;
    new Button(this, 250, y, 'Smaller', () => this.resize(-0.1), 90, 30, 0xc9bde0);
    new Button(this, 350, y, 'Bigger', () => this.resize(0.1), 90, 30, 0xc9bde0);
    this.stickModeButton = new Button(this, 490, y, '', () => this.toggleStickMode(), 170, 30, 0xc9bde0);
    this.opacityButton = new Button(this, 650, y, '', () => this.cycleOpacity(), 130, 30, 0xc9bde0);
    new Button(this, 300, y + 44, 'Reset layout', () => {
      resetTouchLayout();
      this.selected = null;
      this.say('Default layout restored. Press Save to keep it.');
    }, 150, 30, 0xc9bde0);
    new Button(this, 460, y + 44, 'Cancel', () => this.close(false), 120, 30, 0xc9bde0);
    new Button(this, 600, y + 44, 'Save', () => this.close(true), 120, 30, 0x8fd16a);
    this.add.text(GAME_WIDTH / 2, y - 34, 'Drag buttons and the stick to move them.  Tap one, then Smaller / Bigger.', {
      fontFamily: FONT, fontSize: '12px', color: COLORS.uiText,
    }).setOrigin(0.5).setAlpha(0.85);
    this.message = this.add.text(GAME_WIDTH / 2, y + 80, '', { fontFamily: FONT, fontSize: '12px', color: '#b8f27a' }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, y - 64, 'CONTROLS LAYOUT', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: COLORS.uiAccent }).setOrigin(0.5);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return; // pressed a toolbar button
      const target = this.hitTest(p.x, p.y);
      this.selected = target;
      if (!target) return;
      const pos = this.positionOf(target);
      this.dragging = { target, dx: pos.x - p.x, dy: pos.y - p.y };
      Sfx.play('uiMove');
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return;
      const r = this.radiusOf(this.dragging.target);
      const x = Phaser.Math.Clamp(p.x + this.dragging.dx, r, GAME_WIDTH - r);
      const y2 = Phaser.Math.Clamp(p.y + this.dragging.dy, r, GAME_HEIGHT - r);
      const pos = this.positionOf(this.dragging.target);
      pos.x = Math.round(x);
      pos.y = Math.round(y2);
    });
    this.input.on('pointerup', () => (this.dragging = null));
  }

  update(): void {
    if (IS_TOUCH && this.gfx) this.drawLayout();
  }

  private drawLayout(): void {
    const t = getControlSettings().touch;
    const g = this.gfx.clear();
    // Joystick
    const s = t.stick;
    const sr = 52 * s.scale;
    const stickSelected = this.selected?.kind === 'stick';
    g.fillStyle(0xffffff, 0.12).fillCircle(s.x, s.y, sr);
    g.lineStyle(stickSelected ? 3 : 2, stickSelected ? 0xffcf5a : 0xffffff, stickSelected ? 1 : 0.5).strokeCircle(s.x, s.y, sr);
    g.fillStyle(0xffffff, 0.35).fillCircle(s.x, s.y, sr * 0.42);
    this.labels.get('stick')!.setPosition(s.x, s.y + sr + 14)
      .setText(t.stickMode === 'fixed' ? 'STICK (fixed here)' : 'STICK (floating:\nappears under thumb)');
    // Buttons
    for (const d of TOUCH_BUTTONS) {
      const l = t.buttons[d.id];
      const r = d.r * l.scale;
      const sel = this.selected?.kind === 'button' && this.selected.id === d.id;
      g.fillStyle(d.color, t.opacity).fillCircle(l.x, l.y, r);
      g.lineStyle(sel ? 3 : 2, sel ? 0xffcf5a : 0xffffff, sel ? 1 : 0.6).strokeCircle(l.x, l.y, r);
      this.labels.get(d.id)!.setPosition(l.x, l.y);
    }
    this.stickModeButton.setText(`Stick: ${t.stickMode === 'fixed' ? 'Fixed' : 'Floating'}`);
    this.opacityButton.setText(`Opacity ${Math.round(t.opacity * 100)}%`);
  }

  private hitTest(x: number, y: number): EditTarget | null {
    const t = getControlSettings().touch;
    // Topmost first: buttons (drawn last) before the stick.
    for (const d of [...TOUCH_BUTTONS].reverse()) {
      const l = t.buttons[d.id];
      if (Phaser.Math.Distance.Between(x, y, l.x, l.y) <= d.r * l.scale + 8) return { kind: 'button', id: d.id };
    }
    if (Phaser.Math.Distance.Between(x, y, t.stick.x, t.stick.y) <= 52 * t.stick.scale + 8) return { kind: 'stick' };
    return null;
  }

  private positionOf(target: EditTarget): { x: number; y: number; scale: number } {
    const t = getControlSettings().touch;
    return target.kind === 'stick' ? t.stick : t.buttons[target.id as keyof typeof t.buttons];
  }

  private radiusOf(target: EditTarget): number {
    const pos = this.positionOf(target);
    const base = target.kind === 'stick' ? 52 : TOUCH_BUTTONS.find((d) => d.id === target.id)!.r;
    return base * pos.scale;
  }

  private resize(delta: number): void {
    if (!this.selected) return this.say('Tap a button (or the stick) first, then make it smaller or bigger.', '#ffcf5a');
    const pos = this.positionOf(this.selected);
    pos.scale = Phaser.Math.Clamp(Math.round((pos.scale + delta) * 10) / 10, 0.6, 1.6);
    Sfx.play('uiMove');
    this.say(`Size ${Math.round(pos.scale * 100)}%`);
  }

  private toggleStickMode(): void {
    const t = getControlSettings().touch;
    t.stickMode = t.stickMode === 'fixed' ? 'floating' : 'fixed';
    Sfx.play('uiMove');
    this.say(t.stickMode === 'fixed'
      ? 'Fixed: the stick stays where you put it. Touch it to move.'
      : 'Floating: touch anywhere on the left side and the stick appears there.');
  }

  private cycleOpacity(): void {
    const t = getControlSettings().touch;
    const steps = [0.25, 0.4, 0.55, 0.7, 0.85];
    const i = steps.findIndex((v) => v > t.opacity + 0.01);
    t.opacity = steps[i === -1 ? 0 : i];
    Sfx.play('uiMove');
  }

  // ===========================================================================
  // Shared
  // ===========================================================================

  private say(text: string, color = '#b8f27a'): void {
    this.message?.setText(text).setColor(color);
  }

  /** Save (store on this device + tell running scenes) or throw the changes away. */
  private close(save: boolean): void {
    const settings = getControlSettings();
    if (save) {
      saveControlSettings(this.game);
      Sfx.play('uiConfirm');
    } else {
      settings.bindings = this.backup.bindings;
      settings.touch = this.backup.touch;
      Sfx.play('uiBack');
    }
    if (this.from === 'Pause') {
      this.scene.wake('Pause');
      this.scene.stop();
    } else {
      this.scene.start('Title');
    }
  }
}
