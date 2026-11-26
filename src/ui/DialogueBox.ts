import Phaser from 'phaser';
import { COLORS, DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { Sfx } from '../systems/Sfx';
import { FONT } from './Panel';

/** Letters typed per second. */
const TYPE_SPEED = 45;

/**
 * NPC dialogue at the bottom of the screen, with a typewriter effect.
 *
 *   box.show('Tilda', ['Hello!', 'Want to buy something?'], () => openShop());
 *
 * Press E / Enter / click:
 *   - while typing  -> show the whole line at once
 *   - line finished -> next line, or close (then `onDone` runs)
 */
export class DialogueBox {
  isOpen = false;
  private readonly root: Phaser.GameObjects.Container;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly arrow: Phaser.GameObjects.Text;
  private lines: string[] = [];
  private lineIndex = 0;
  /** How many letters of the current line are visible (a float, grows over time). */
  private shown = 0;
  private onDone: () => void = () => {};

  constructor(private readonly scene: Phaser.Scene) {
    const w = GAME_WIDTH - 80;
    const h = 110;
    this.root = scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT - h / 2 - 20).setDepth(DEPTH.ui + 20).setVisible(false);
    const bg = scene.add.graphics();
    bg.fillStyle(0x1a1422, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(2, 0xffcf5a, 0.9).strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.nameText = scene.add.text(-w / 2 + 20, -h / 2 + 12, '', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: COLORS.uiAccent });
    this.bodyText = scene.add.text(-w / 2 + 20, -h / 2 + 38, '', {
      fontFamily: FONT, fontSize: '15px', color: COLORS.uiText, wordWrap: { width: w - 40 }, lineSpacing: 4,
    });
    this.arrow = scene.add.text(w / 2 - 18, h / 2 - 12, 'E >', { fontFamily: FONT, fontSize: '12px', color: COLORS.uiAccent }).setOrigin(1, 1);
    this.root.add([bg, this.nameText, this.bodyText, this.arrow]);
    // Clicking anywhere on the box also advances.
    bg.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains).on('pointerdown', () => this.advance());
  }

  show(speaker: string, lines: string[], onDone: () => void = () => {}): void {
    this.lines = lines;
    this.lineIndex = 0;
    this.shown = 0;
    this.onDone = onDone;
    this.isOpen = true;
    this.nameText.setText(speaker);
    this.bodyText.setText('');
    this.root.setScrollFactor(0, 0, true).setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 120 });
  }

  /** Call every frame from the owning scene. */
  update(dt: number): void {
    if (!this.isOpen) return;
    const line = this.lines[this.lineIndex];
    const before = Math.floor(this.shown);
    this.shown = Math.min(line.length, this.shown + TYPE_SPEED * dt);
    const now = Math.floor(this.shown);
    if (now !== before) {
      this.bodyText.setText(line.slice(0, now));
      if (now % 2 === 0 && line[now - 1] !== ' ') Sfx.play('blip'); // little "voice" while typing
    }
    // Blinking arrow when the line is complete.
    const done = this.shown >= line.length;
    this.arrow.setVisible(done && Math.floor(this.scene.time.now / 400) % 2 === 0);
  }

  /** E / Enter / click. */
  advance(): void {
    if (!this.isOpen) return;
    const line = this.lines[this.lineIndex];
    if (this.shown < line.length) {
      this.shown = line.length; // skip the typing
      this.bodyText.setText(line);
      return;
    }
    this.lineIndex++;
    if (this.lineIndex < this.lines.length) {
      this.shown = 0;
      this.bodyText.setText('');
      return;
    }
    this.close();
    this.onDone();
  }

  close(): void {
    this.isOpen = false;
    this.root.setVisible(false);
  }
}
