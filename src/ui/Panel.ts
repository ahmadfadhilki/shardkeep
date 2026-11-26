import Phaser from 'phaser';
import { COLORS, DEPTH, GAME_HEIGHT, GAME_WIDTH, IS_TOUCH } from '../config';
import { Sfx } from '../systems/Sfx';

/** Keys a panel understands. The scene that owns the panel translates real keys into these. */
export type PanelKey = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'alt';

export const FONT = 'monospace';

/**
 * A clickable button: rounded box + label. Hover lights it up.
 * Call `setEnabled(false)` to grey it out (clicks are then ignored).
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private enabled = true;
  private highlighted = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    private readonly onClick: () => void,
    private readonly bw = 110,
    private readonly bh = 28,
    private readonly color = 0xffcf5a,
  ) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, text, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#1a1422' }).setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(bw, bh).setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.setHighlight(true));
    this.on('pointerout', () => this.setHighlight(false));
    this.on('pointerdown', () => this.press());
    scene.add.existing(this);
    this.draw();
  }

  press(): void {
    if (this.enabled) this.onClick();
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.draw();
    return this;
  }

  /** Keyboard focus looks the same as mouse hover. */
  setHighlight(on: boolean): this {
    this.highlighted = on;
    this.draw();
    return this;
  }

  private draw(): void {
    const g = this.bg.clear();
    const fill = !this.enabled ? 0x4a4258 : this.color;
    g.fillStyle(fill, this.highlighted && this.enabled ? 1 : 0.8).fillRoundedRect(-this.bw / 2, -this.bh / 2, this.bw, this.bh, 6);
    if (this.highlighted && this.enabled) g.lineStyle(2, 0xffffff, 1).strokeRoundedRect(-this.bw / 2, -this.bh / 2, this.bw, this.bh, 6);
    this.label.setColor(this.enabled ? '#1a1422' : '#8a8298');
  }
}

/**
 * Panel: a centered window drawn on top of everything (shop, party info...).
 * Subclasses add their content to `root` and react to keys in handleKey().
 *
 * It ignores the camera (scrollFactor 0), so it stays put while the map scrolls.
 */
export abstract class Panel {
  protected readonly root: Phaser.GameObjects.Container;
  isOpen = false;
  /** Called when the panel closes itself (Esc). */
  onClose: () => void = () => {};

  constructor(
    protected readonly scene: Phaser.Scene,
    protected readonly width: number,
    protected readonly height: number,
    title: string,
  ) {
    this.root = scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setScrollFactor(0).setDepth(DEPTH.ui).setVisible(false);

    // Dark backdrop over the whole screen, then the window itself.
    const shade = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55);
    const bg = scene.add.graphics();
    bg.fillStyle(0x1a1422, 0.97).fillRoundedRect(-width / 2, -height / 2, width, height, 12);
    bg.lineStyle(2, 0xffcf5a, 0.9).strokeRoundedRect(-width / 2, -height / 2, width, height, 12);
    const titleText = scene.add
      .text(-width / 2 + 20, -height / 2 + 14, title, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: COLORS.uiAccent });
    // Close button (bottom-right). Esc also closes.
    const close = new Button(scene, width / 2 - 62, height / 2 - 26, IS_TOUCH ? 'Close' : 'Close (Esc)', () => this.close(), 100, 28, 0xc9bde0);
    this.root.add([shade, bg, titleText, close]);
  }

  open(): void {
    this.isOpen = true;
    this.refresh();
    // Pin the panel AND all its children to the screen. (A container's scroll
    // factor is not passed on to its children unless we ask with `true`.)
    this.root.setScrollFactor(0, 0, true);
    this.root.setVisible(true).setScale(0.92).setAlpha(0);
    this.scene.tweens.add({ targets: this.root, scale: 1, alpha: 1, duration: 140, ease: 'Back.easeOut' });
  }

  close(): void {
    this.isOpen = false;
    this.root.setVisible(false);
    Sfx.play('uiBack');
    this.onClose();
  }

  /** Redraw the content from the current game state. */
  abstract refresh(): void;

  handleKey(key: PanelKey): void {
    if (key === 'back') this.close();
  }

  /** Helper: add a text object to the panel. Coordinates are relative to the panel center. */
  protected text(x: number, y: number, value: string, size = 14, color: string = COLORS.uiText): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color });
    this.root.add(t);
    return t;
  }
}
