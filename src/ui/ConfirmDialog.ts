import Phaser from 'phaser';
import { COLORS, DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { Sfx } from '../systems/Sfx';
import { Button, FONT, type PanelKey } from './Panel';

/**
 * "Are you sure?" box with Yes / No buttons.
 *
 *   dialog.ask('Buy this for 30 coins?', () => buyIt());
 *
 * Keyboard: A/D or arrows pick a button, E/Enter presses it, Esc = No.
 * Mouse: click a button.
 * It opens on top of everything, so the owner forwards keys to it while `isOpen`.
 */
export class ConfirmDialog {
  isOpen = false;
  private readonly root: Phaser.GameObjects.Container;
  private readonly message: Phaser.GameObjects.Text;
  private readonly yes: Button;
  private readonly no: Button;
  /** 0 = Yes, 1 = No. Starts on Yes. */
  private choice = 0;
  private onYes: () => void = () => {};

  constructor(private readonly scene: Phaser.Scene) {
    const w = 420;
    const h = 150;
    this.root = scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(DEPTH.ui + 50).setVisible(false);
    const shade = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45).setInteractive(); // blocks clicks behind
    const bg = scene.add.graphics();
    bg.fillStyle(0x241c30, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    bg.lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    this.message = scene.add
      .text(0, -h / 2 + 22, '', { fontFamily: FONT, fontSize: '15px', color: COLORS.uiText, align: 'center', wordWrap: { width: w - 40 } })
      .setOrigin(0.5, 0);
    this.yes = new Button(scene, -70, h / 2 - 32, 'Yes', () => this.finish(true), 110, 30, 0x8fd16a);
    this.no = new Button(scene, 70, h / 2 - 32, 'No', () => this.finish(false), 110, 30, 0xc9bde0);
    this.yes.on('pointerover', () => this.focus(0));
    this.no.on('pointerover', () => this.focus(1));
    this.root.add([shade, bg, this.message, this.yes, this.no]);
  }

  ask(text: string, onYes: () => void): void {
    this.onYes = onYes;
    this.message.setText(text);
    this.isOpen = true;
    this.focus(0);
    this.root.setScrollFactor(0, 0, true).setVisible(true).setScale(0.9);
    this.scene.tweens.add({ targets: this.root, scale: 1, duration: 120, ease: 'Back.easeOut' });
  }

  handleKey(key: PanelKey): void {
    if (key === 'left' || key === 'right' || key === 'up' || key === 'down') {
      this.focus(1 - this.choice);
      Sfx.play('uiMove');
    } else if (key === 'confirm') this.finish(this.choice === 0);
    else if (key === 'back') this.finish(false);
  }

  private focus(i: number): void {
    this.choice = i;
    this.yes.setHighlight(i === 0);
    this.no.setHighlight(i === 1);
  }

  private finish(yes: boolean): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.setVisible(false);
    if (yes) this.onYes();
    else Sfx.play('uiBack');
  }
}
