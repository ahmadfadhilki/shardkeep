import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { getSave, hasSave, newGame } from '../systems/SaveData';

/**
 * The title screen: Continue (if a save exists) or New Game.
 * W/S or the mouse to choose, Enter or click to confirm.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    this.cameras.main.setBackgroundColor(COLORS.background);

    // Floating "shards" in the background for a bit of life.
    for (let i = 0; i < 18; i++) {
      const shard = this.add
        .rectangle(
          Phaser.Math.Between(0, GAME_WIDTH),
          Phaser.Math.Between(0, GAME_HEIGHT),
          6,
          6,
          Phaser.Utils.Array.GetRandom([0xe0574a, 0x4a8fe0, 0x5fb85a, 0xffcf5a]),
        )
        .setAngle(45)
        .setAlpha(0.5);
      this.tweens.add({
        targets: shard,
        y: shard.y - Phaser.Math.Between(20, 50),
        alpha: 0.1,
        duration: Phaser.Math.Between(2000, 4000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    const title = this.add
      .text(cx, 190, 'SHARDKEEP', {
        fontFamily: 'monospace',
        fontSize: '72px',
        color: COLORS.uiAccent,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(4, 4, '#000000', 0, true, true);
    this.tweens.add({ targets: title, y: 200, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add
      .text(cx, 270, 'a tiny top-down action RPG', { fontFamily: 'monospace', fontSize: '18px', color: COLORS.uiText })
      .setOrigin(0.5);

    // --- Menu: Continue / New Game ---
    const options: { label: string; action: () => void }[] = [];
    if (hasSave()) options.push({ label: 'Continue', action: () => { getSave(); start(); } });
    options.push({ label: 'New Game', action: () => confirmNewGame() });

    let selected = 0;
    let confirming = false;
    const texts = options.map((o, i) =>
      this.add
        .text(cx, 360 + i * 44, o.label, { fontFamily: 'monospace', fontSize: '24px', color: COLORS.uiText })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => { selected = i; refresh(); })
        .on('pointerdown', () => { selected = i; o.action(); }),
    );
    const note = this.add
      .text(cx, 360 + options.length * 44 + 10, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ff9b9b' })
      .setOrigin(0.5);

    const refresh = () => {
      texts.forEach((t, i) => {
        const on = i === selected;
        t.setText(on ? `> ${options[i].label} <` : options[i].label).setColor(on ? COLORS.uiAccent : COLORS.uiText);
      });
    };

    let leaving = false;
    const start = () => {
      if (leaving) return;
      leaving = true;
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Hub'));
    };

    // Starting over deletes your progress, so ask twice when a save exists.
    const confirmNewGame = () => {
      if (hasSave() && !confirming) {
        confirming = true;
        note.setText('This erases your save! Choose New Game again to confirm.');
        return;
      }
      newGame();
      start();
    };

    const kb = this.input.keyboard!;
    const move = (d: number) => {
      selected = Phaser.Math.Wrap(selected + d, 0, options.length);
      confirming = false;
      note.setText('');
      refresh();
    };
    kb.on('keydown-W', () => move(-1));
    kb.on('keydown-UP', () => move(-1));
    kb.on('keydown-S', () => move(1));
    kb.on('keydown-DOWN', () => move(1));
    kb.on('keydown-ENTER', () => options[selected].action());
    kb.on('keydown-SPACE', () => options[selected].action());
    refresh();
  }
}
