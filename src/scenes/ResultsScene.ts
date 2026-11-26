import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, IS_TOUCH } from '../config';
import { getHeroDef } from '../data/heroes';
import { getStageDef } from '../data/stages';
import { SKILLS } from '../data/skills';
import { heroMaxHp, levelFromXp, skillCooldownAt, skillManaAt } from '../data/progression';
import { getSave, heroSave, getParty } from '../systems/SaveData';
import { STARS_PER_STAGE } from '../systems/StageRun';
import { FONT } from '../ui/Panel';
import { formatTime } from './StageSelectScene';
import { submitBestTime } from '../services/saveService';
import { Button } from '../ui/Panel';
import type { LeaderboardData } from './LeaderboardScene';

/** What StageScene hands to the Results screen. */
export interface ResultsData {
  stageId: string;
  time: number;
  coins: number;
  stars: number;
  /** Each hero's lifetime XP at the start of the run. */
  xpBefore: Record<string, number>;
  /** XP from enemies during the run. */
  xpGained: number;
  /** Bonus XP for clearing. */
  clearXp: number;
  newBest: boolean;
  firstClear: boolean;
}

/** How long the XP bars take to fill (ms). */
const FILL_TIME = 1800;

/**
 * ResultsScene: the "you did it!" screen after a stage.
 * The rewards are already saved (StageScene did that); this scene only SHOWS
 * them: stats on the left, then each hero's XP bar fills up, popping
 * "LEVEL UP!" every time it crosses a level.
 */
export class ResultsScene extends Phaser.Scene {
  private results!: ResultsData;
  private bars!: Phaser.GameObjects.Graphics;
  private rows: { id: string; label: Phaser.GameObjects.Text; stats: Phaser.GameObjects.Text; shownLevel: number; y: number }[] = [];
  /** 0 -> 1 while the bars fill. */
  private progress = 0;
  private canLeave = false;

  constructor() {
    super('Results');
  }

  init(data: ResultsData): void {
    this.results = data;
    this.rows = [];
    this.progress = 0;
    this.canLeave = false;
  }

  create(): void {
    const d = this.results;
    const stage = getStageDef(d.stageId);
    this.cameras.main.setBackgroundColor(COLORS.background).fadeIn(300, 0, 0, 0);

    const title = this.add.text(GAME_WIDTH / 2, 48, 'STAGE CLEAR!', { fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: COLORS.uiAccent })
      .setOrigin(0.5).setScale(1.4).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
    this.add.text(GAME_WIDTH / 2, 86, stage.name + (d.firstClear ? '  -  first clear!' : ''), { fontFamily: FONT, fontSize: '15px', color: COLORS.uiText })
      .setOrigin(0.5);

    // --- Left column: run stats (appear one by one) ---
    const stats: [string, string, string][] = [
      ['Time', formatTime(d.time) + (d.newBest ? '   NEW BEST!' : ''), d.newBest ? '#8fd16a' : COLORS.uiText],
      ['Stars', `${d.stars} / ${STARS_PER_STAGE}`, '#fff27a'],
      ['Coins', `+${d.coins}   (bank: ${getSave().coins})`, '#ffd23f'],
      ['XP', `+${d.xpGained} enemies  +${d.clearXp} clear`, '#b8f27a'],
    ];
    stats.forEach(([name, value, color], i) => {
      const y = 140 + i * 40;
      const row = this.add.container(70, y).setAlpha(0);
      row.add(this.add.text(0, 0, name, { fontFamily: FONT, fontSize: '16px', color: COLORS.uiText }).setAlpha(0.7));
      row.add(this.add.text(80, 0, value, { fontFamily: FONT, fontSize: '16px', color }));
      this.tweens.add({ targets: row, alpha: 1, x: 60, delay: 300 + i * 180, duration: 250 });
    });

    // --- Right column: one XP bar per hero ---
    this.bars = this.add.graphics();
    getParty().forEach((id, i) => {
      const def = getHeroDef(id);
      const y = 140 + i * 92;
      const before = levelFromXp(d.xpBefore[id] ?? 0);
      this.add.rectangle(500, y + 12, 22, 26, def.color).setStrokeStyle(2, 0x1a1422);
      const label = this.add.text(522, y, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: COLORS.uiText });
      const statsText = this.add.text(522, y + 46, '', { fontFamily: FONT, fontSize: '12px', color: '#c9bde0' });
      this.rows.push({ id, label, stats: statsText, shownLevel: before.level, y });
    });

    // Fill the bars after the stats have appeared.
    this.tweens.add({
      targets: this,
      progress: 1,
      delay: 1100,
      duration: FILL_TIME,
      ease: 'Sine.easeInOut',
      onComplete: () => this.showContinue(),
    });

    const go = () => {
      if (!this.canLeave) {
        // Impatient? Skip the animation.
        this.tweens.killTweensOf(this);
        this.progress = 1;
        this.showContinue();
        return;
      }
      this.canLeave = false;
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Hub'));
    };
    this.input.keyboard!.on('keydown-ENTER', go);
    this.input.keyboard!.on('keydown-E', go);
    this.input.keyboard!.on('keydown-SPACE', go);
    // Taps on a button (like Leaderboard) shouldn't also mean "continue".
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) go();
    });

    this.postTime();
  }

  /** Send this clear to the leaderboard and say what happened. */
  private postTime(): void {
    const d = this.results;
    const line = this.add.text(60, 320, 'Leaderboard: posting your time...', { fontFamily: FONT, fontSize: '14px', color: '#c9bde0' });
    new Button(this, 160, 370, 'Leaderboard', () => {
      this.scene.start('Leaderboard', { stageId: d.stageId, back: 'Hub' } satisfies LeaderboardData);
    }, 200, 32);
    void submitBestTime(d.stageId, d.time).then((r) => {
      if (!this.scene.isActive()) return;
      if (r === 'posted') line.setText('Leaderboard: time posted!').setColor('#b8f27a');
      else if (r === 'offline') line.setText('Leaderboard: offline, will post later.').setColor('#ffcf5a');
      else line.setText('Leaderboard: log in to post your times.');
    });
  }

  update(): void {
    const g = this.bars.clear();
    for (const row of this.rows) {
      const def = getHeroDef(row.id);
      const before = this.results.xpBefore[row.id] ?? 0;
      const after = heroSave(row.id).xp;
      const shownXp = before + (after - before) * this.progress;
      const { level, into, need } = levelFromXp(shownXp);

      // Crossed a level while filling: celebrate!
      if (level > row.shownLevel) {
        row.shownLevel = level;
        this.levelUpPop(row.y);
      }

      const startLevel = levelFromXp(before).level;
      row.label.setText(`${def.name}   Lv.${level}${level > startLevel ? `   (+${level - startLevel})` : ''}`);
      const skill = SKILLS[def.role];
      row.stats.setText(
        `HP ${heroMaxHp(def, level)}    ${skill.name}: ${skillCooldownAt(def, skill, level).toFixed(1)}s / ${skillManaAt(def, skill, level)} mana`,
      );

      const x = 522;
      const y = row.y + 26;
      const w = 360;
      g.fillStyle(0x000000, 0.6).fillRect(x - 2, y - 2, w + 4, 14);
      g.fillStyle(0xb8f27a).fillRect(x, y, need > 0 ? w * (into / need) : w, 10);
    }
  }

  private levelUpPop(y: number): void {
    const t = this.add.text(900, y + 8, 'LEVEL UP!', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffd23f', stroke: '#1a1422', strokeThickness: 4 })
      .setOrigin(1, 0.5).setScale(1.6);
    this.tweens.add({ targets: t, scale: 1, duration: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 400, onComplete: () => t.destroy() });
    this.cameras.main.flash(120, 255, 240, 160);
  }

  private showContinue(): void {
    if (this.canLeave) return;
    this.canLeave = true;
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 40, IS_TOUCH ? 'Tap to return to town' : 'Press ENTER (or click) to return to town', { fontFamily: FONT, fontSize: '18px', color: COLORS.uiText })
      .setOrigin(0.5);
    this.tweens.add({ targets: t, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
  }
}
