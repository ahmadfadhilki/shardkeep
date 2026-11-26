import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../config';
import { getStageDef, STAGES } from '../data/stages';
import { fetchLeaderboard, getAccount, isOnlineAvailable } from '../services/saveService';
import { Sfx } from '../systems/Sfx';
import { Button, FONT } from '../ui/Panel';
import { formatTime } from './StageSelectScene';

export interface LeaderboardData {
  stageId?: string;
  /** Scene to return to with the Back button. */
  back?: string;
}

/**
 * LeaderboardScene: the 10 fastest clears of a stage, from Supabase.
 * Only display names are shown (never emails). Your own row is highlighted.
 * Left / Right (or the arrow buttons) switch between stages.
 */
export class LeaderboardScene extends Phaser.Scene {
  private stageIndex = 0;
  private back = 'StageSelect';
  private rows!: Phaser.GameObjects.Text;
  private title!: Phaser.GameObjects.Text;
  private footer!: Phaser.GameObjects.Text;
  private highlight!: Phaser.GameObjects.Graphics;
  /** Ignore answers to old requests after switching stage quickly. */
  private requestId = 0;

  constructor() {
    super('Leaderboard');
  }

  init(data: LeaderboardData): void {
    this.stageIndex = Math.max(0, STAGES.findIndex((s) => s.id === data?.stageId));
    this.back = data?.back ?? 'StageSelect';
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background).fadeIn(200, 0, 0, 0);
    this.add.text(GAME_WIDTH / 2, 36, 'LEADERBOARD', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: COLORS.uiAccent }).setOrigin(0.5);
    this.title = this.add.text(GAME_WIDTH / 2, 76, '', { fontFamily: FONT, fontSize: '17px', color: COLORS.uiText }).setOrigin(0.5);

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(GAME_WIDTH / 2 - 260, 100, 520, 340, 10);
    this.highlight = this.add.graphics();
    this.rows = this.add.text(GAME_WIDTH / 2 - 230, 116, '', { fontFamily: FONT, fontSize: '17px', color: COLORS.uiText, lineSpacing: 12 });
    this.footer = this.add.text(GAME_WIDTH / 2, 470, '', { fontFamily: FONT, fontSize: '14px', color: '#c9bde0', align: 'center' }).setOrigin(0.5);

    new Button(this, 70, 36, '< Back', () => this.leave(), 100, 32, 0xc9bde0);
    if (STAGES.length > 1) {
      new Button(this, GAME_WIDTH / 2 - 300, 76, '<', () => this.changeStage(-1), 40, 32, 0xc9bde0);
      new Button(this, GAME_WIDTH / 2 + 300, 76, '>', () => this.changeStage(1), 40, 32, 0xc9bde0);
    }
    new Button(this, GAME_WIDTH - 80, 36, 'Refresh', () => void this.refreshBoard(), 110, 32);

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.leave());
    kb.on('keydown-LEFT', () => this.changeStage(-1));
    kb.on('keydown-A', () => this.changeStage(-1));
    kb.on('keydown-RIGHT', () => this.changeStage(1));
    kb.on('keydown-D', () => this.changeStage(1));
    void this.refreshBoard();
  }

  private changeStage(delta: number): void {
    if (STAGES.length < 2) return;
    this.stageIndex = Phaser.Math.Wrap(this.stageIndex + delta, 0, STAGES.length);
    Sfx.play('uiMove');
    void this.refreshBoard();
  }

  private async refreshBoard(): Promise<void> {
    const stage = getStageDef(STAGES[this.stageIndex].id);
    this.title.setText(stage.name);
    this.highlight.clear();
    if (!isOnlineAvailable()) {
      this.rows.setText('');
      this.footer.setText('The leaderboard needs online features, which are not set up in this build.');
      return;
    }
    this.rows.setText('Loading...');
    this.footer.setText('');
    const id = ++this.requestId;
    const result = await fetchLeaderboard(stage.id);
    if (id !== this.requestId || !this.scene.isActive()) return; // a newer request (or we left)

    if (!result) {
      this.rows.setText("Can't reach the server.\nCheck your internet and press Refresh.");
      return;
    }
    if (result.top.length === 0) {
      this.rows.setText('No clears yet. Be the first!');
    } else {
      // "  1.  PlayerName ........ 4:12.35"
      const lines = result.top.map((r) => `${String(r.rank).padStart(2)}.  ${r.name.padEnd(17, ' ')} ${formatTime(r.time)}${centis(r.time)}`);
      this.rows.setText(lines.join('\n'));
      // Gold bar behind your own row.
      const mine = result.top.findIndex((r) => r.isMe);
      if (mine >= 0) {
        const lineH = this.rows.height / result.top.length;
        this.highlight.fillStyle(0xffcf5a, 0.18).fillRect(GAME_WIDTH / 2 - 250, this.rows.y + mine * lineH - 4, 500, lineH);
      }
    }

    const account = getAccount();
    if (!account) this.footer.setText('Log in (Title screen) to put your times on the leaderboard.');
    else if (result.myBest === null) this.footer.setText(`${account.displayName}: no time yet. Clear the stage to get on the board!`);
    else this.footer.setText(`Your best (${account.displayName}): ${formatTime(result.myBest)}${centis(result.myBest)}`);
  }

  private leave(): void {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.back));
  }
}

/** ".35" hundredths, so close times can be told apart. */
function centis(seconds: number): string {
  return '.' + String(Math.floor((seconds % 1) * 100)).padStart(2, '0');
}
