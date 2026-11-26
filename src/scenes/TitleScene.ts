import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, IS_TOUCH } from '../config';
import { getSave, hasSave, newGame } from '../systems/SaveData';
import { getAccount, isOnlineAvailable, logOut } from '../services/saveService';
import { Button } from '../ui/Panel';

/**
 * The title screen: Continue (if a save exists) or New Game.
 * W/S or the mouse to choose, Enter or click to confirm.
 */
export class TitleScene extends Phaser.Scene {
  /** A message from the login screen (e.g. "your guest progress was copied"). */
  private notice?: string;

  constructor() {
    super('Title');
  }

  init(data: { notice?: string }): void {
    this.notice = data?.notice;
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
      if (IS_TOUCH) this.goFullscreen();
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
    this.drawAccountBar();
    if (IS_TOUCH) {
      this.add.text(cx, GAME_HEIGHT - 24, 'Touch controls on. Best played sideways, full screen.', { fontFamily: 'monospace', fontSize: '13px', color: COLORS.uiText })
        .setOrigin(0.5).setAlpha(0.7);
    }
  }

  /** Top bar: who is playing, plus Log out (or Log in for guests). */
  private drawAccountBar(): void {
    const account = getAccount();
    const who = account ? `Logged in as ${account.displayName}  (cloud save)` : 'Playing as Guest  (saved in this browser only)';
    this.add.text(16, 16, who, { fontFamily: 'monospace', fontSize: '13px', color: account ? '#b8f27a' : COLORS.uiText }).setAlpha(0.85);

    const label = account ? 'Log out' : isOnlineAvailable() ? 'Log in / Sign up' : '';
    if (label) {
      new Button(this, GAME_WIDTH - 90, 26, label, () => {
        void (async () => {
          if (account) await logOut(); // uploads unsaved progress first
          this.scene.start('Login');
        })();
      }, 150, 28, 0xc9bde0);
    }
    if (this.notice) {
      const t = this.add.text(GAME_WIDTH / 2, 320, this.notice, {
        fontFamily: 'monospace', fontSize: '14px', color: '#1a1422', backgroundColor: '#b8f27a', padding: { x: 10, y: 5 },
      }).setOrigin(0.5);
      this.tweens.add({ targets: t, alpha: 0, delay: 4000, duration: 600, onComplete: () => t.destroy() });
    }
  }

  /**
   * Phones: hide the browser bars and keep the screen sideways.
   * Not every browser allows this (iPhone Safari doesn't), so failures are ignored.
   */
  private goFullscreen(): void {
    try {
      // Ask the browser directly so a "no" is caught instead of becoming an error.
      // (Phaser's scale manager notices the change and resizes the game by itself.)
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      orientation.lock?.('landscape').catch(() => {});
    } catch {
      // ignore: the game works without fullscreen
    }
  }
}
