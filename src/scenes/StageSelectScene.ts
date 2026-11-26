import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, IS_TOUCH } from '../config';
import { getHeroDef } from '../data/heroes';
import { STAGES } from '../data/stages';
import { heroLevel, stageSave, getParty } from '../systems/SaveData';
import { STARS_PER_STAGE } from '../systems/StageRun';
import { Button, FONT } from '../ui/Panel';
import type { StageSceneData } from './StageScene';

/** Cards shown after the real stages, so players can see more is planned. */
const COMING_SOON = ['Frostmere Caves', 'Skyroot Ruins'];

/**
 * How hard a stage will feel, from your party's average level vs. the
 * stage's recommended level. This is how players choose their own challenge:
 * over-level to stomp the boss, or go in under-leveled for a real fight.
 */
export function difficultyLabel(partyLevel: number, recommended: number): { text: string; color: string } {
  const diff = partyLevel - recommended;
  if (diff >= 3) return { text: 'EASY', color: '#8fd16a' };
  if (diff >= 0) return { text: 'FAIR', color: '#ffd23f' };
  if (diff >= -2) return { text: 'TOUGH', color: '#ff9b3d' };
  return { text: 'DEADLY', color: '#ff5a5a' };
}

export function formatTime(seconds: number): string {
  const t = Math.floor(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * StageSelectScene: pick where to go. A/D or arrows (or the mouse) to choose,
 * Enter / E / click to start, Esc to go back to town.
 */
export class StageSelectScene extends Phaser.Scene {
  private selected = 0;
  private cards: Phaser.GameObjects.Container[] = [];
  private leaving = false;

  constructor() {
    super('StageSelect');
  }

  create(): void {
    this.cards = [];
    this.leaving = false;
    this.selected = 0;
    this.cameras.main.setBackgroundColor(COLORS.background).fadeIn(250, 0, 0, 0);

    this.add.text(GAME_WIDTH / 2, 50, 'CHOOSE A STAGE', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: COLORS.uiAccent })
      .setOrigin(0.5);

    const levels = getParty().map(heroLevel);
    const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
    const partyLine = getParty().map((id, i) => `${getHeroDef(id).name} Lv.${levels[i]}`).join('    ');
    this.add.text(GAME_WIDTH / 2, 88, `Your party:  ${partyLine}`, { fontFamily: FONT, fontSize: '14px', color: COLORS.uiText })
      .setOrigin(0.5);

    // --- One card per stage, then "coming soon" cards ---
    const total = STAGES.length + COMING_SOON.length;
    const cardW = 260;
    const gap = 24;
    const startX = GAME_WIDTH / 2 - ((total - 1) * (cardW + gap)) / 2;
    STAGES.forEach((stage, i) => {
      const rec = stageSave(stage.id);
      const diff = difficultyLabel(avg, stage.recommendedLevel);
      const lines = [
        stage.description,
        '',
        `Recommended  Lv.${stage.recommendedLevel}`,
        `Best time    ${rec.cleared ? formatTime(rec.bestTime) : '--:--'}`,
        `Stars        ${rec.stars.length} / ${STARS_PER_STAGE}`,
      ];
      this.makeCard(startX + i * (cardW + gap), stage.name, lines, diff, rec.cleared, true, i);
    });
    COMING_SOON.forEach((name, j) => {
      const i = STAGES.length + j;
      this.makeCard(startX + i * (cardW + gap), name, ['', 'Coming soon...'], null, false, false, i);
    });

    new Button(this, 70, 40, '< Town', () => this.goTo('Hub'), 100, 32, 0xc9bde0);
    new Button(this, GAME_WIDTH - 90, 40, 'Leaderboard', () => {
      this.goTo('Leaderboard', { stageId: STAGES[Math.min(this.selected, STAGES.length - 1)].id, back: 'StageSelect' });
    }, 150, 32);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30, IS_TOUCH ? 'Tap a stage to start.' : 'Click a stage to start.   Keys: A/D choose, Enter start, Esc back', { fontFamily: FONT, fontSize: '13px', color: COLORS.uiText })
      .setOrigin(0.5).setAlpha(0.7);

    const kb = this.input.keyboard!;
    kb.on('keydown-A', () => this.select(this.selected - 1));
    kb.on('keydown-LEFT', () => this.select(this.selected - 1));
    kb.on('keydown-D', () => this.select(this.selected + 1));
    kb.on('keydown-RIGHT', () => this.select(this.selected + 1));
    kb.on('keydown-ENTER', () => this.start());
    kb.on('keydown-E', () => this.start());
    kb.on('keydown-SPACE', () => this.start());
    kb.on('keydown-ESC', () => this.goTo('Hub'));
    this.select(0);
  }

  private makeCard(
    x: number,
    title: string,
    lines: string[],
    diff: { text: string; color: string } | null,
    cleared: boolean,
    playable: boolean,
    index: number,
  ): void {
    const w = 260;
    const h = 300;
    const card = this.add.container(x, GAME_HEIGHT / 2 + 20);
    const bg = this.add.graphics();
    bg.fillStyle(playable ? 0x2a2236 : 0x1c1724, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    card.add(bg);
    card.add(this.add.text(0, -h / 2 + 22, title, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: playable ? COLORS.uiText : '#666666' }).setOrigin(0.5));
    card.add(
      this.add.text(-w / 2 + 18, -h / 2 + 56, lines.join('\n'), {
        fontFamily: FONT, fontSize: '13px', color: playable ? '#c9bde0' : '#555555', wordWrap: { width: w - 36 }, lineSpacing: 4,
      }),
    );
    if (diff) {
      card.add(this.add.text(0, h / 2 - 54, diff.text, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: diff.color }).setOrigin(0.5));
      card.add(this.add.text(0, h / 2 - 30, 'for your party', { fontFamily: FONT, fontSize: '11px', color: COLORS.uiText }).setOrigin(0.5).setAlpha(0.6));
    }
    if (cleared) {
      card.add(this.add.text(w / 2 - 14, -h / 2 + 10, 'CLEAR', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#1a1422', backgroundColor: '#8fd16a', padding: { x: 4, y: 2 } }).setOrigin(1, 0));
    }
    // A border we light up when this card is selected.
    const border = this.add.graphics();
    border.lineStyle(3, 0xffcf5a, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    border.setName('border');
    card.add(border);
    card.setData('playable', playable);

    card.setSize(w, h).setInteractive({ useHandCursor: playable });
    card.on('pointerover', () => this.select(index));
    card.on('pointerdown', () => { this.select(index); this.start(); });
    this.cards.push(card);
  }

  private select(i: number): void {
    this.selected = Phaser.Math.Wrap(i, 0, this.cards.length);
    this.cards.forEach((c, j) => {
      const on = j === this.selected;
      (c.getByName('border') as Phaser.GameObjects.Graphics).setVisible(on);
      this.tweens.add({ targets: c, scale: on ? 1.04 : 0.96, duration: 120 });
    });
  }

  private start(): void {
    const card = this.cards[this.selected];
    if (!card.getData('playable')) {
      this.tweens.add({ targets: card, x: card.x + 8, duration: 50, yoyo: true, repeat: 2 }); // "nope" shake
      return;
    }
    const stage = STAGES[this.selected];
    this.goTo('Stage', { stageId: stage.id } satisfies StageSceneData);
  }

  private goTo(scene: string, data?: object): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }
}
