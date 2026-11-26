import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, IS_TOUCH } from '../config';
import { stageTouch, TouchControls } from '../ui/TouchControls';
import { bindingLabel, CONTROLS_CHANGED, getControlSettings, TOUCH_BUTTONS } from '../systems/ControlSettings';
import type { StageScene } from './StageScene';
import type { Hero } from '../entities/Hero';
import { STARS_PER_STAGE } from '../systems/StageRun';
import { getSave, heroSave } from '../systems/SaveData';
import { levelFromXp } from '../data/progression';

const ELEMENT_COLOR = { fire: '#ff7a5a', water: '#6ab8ff', earth: '#8fd16a' } as const;

/**
 * UIScene: the HUD, drawn on top of StageScene.
 *
 * Why a separate scene? The Stage camera scrolls and shakes; the HUD must not.
 * A separate scene has its own camera that never moves.
 *
 * It simply READS the stage's state every frame and redraws. Polling like this
 * is very simple and fast enough for a small HUD.
 */
export class UIScene extends Phaser.Scene {
  private bars!: Phaser.GameObjects.Graphics;
  private cooldowns!: Phaser.GameObjects.Graphics;
  private partyTexts: Phaser.GameObjects.Text[] = [];
  private skillName!: Phaser.GameObjects.Text;
  /** Seconds left on the skill cooldown, written inside the skill icon. */
  private skillTimer!: Phaser.GameObjects.Text;
  private potionTexts: Phaser.GameObjects.Text[] = [];
  private crosshair!: Phaser.GameObjects.Image;
  private chainPanel!: Phaser.GameObjects.Container;
  private chainChip!: Phaser.GameObjects.Rectangle;
  private chainText!: Phaser.GameObjects.Text;
  private chainSub!: Phaser.GameObjects.Text;
  private chainCount!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private starText!: Phaser.GameObjects.Text;
  private keyIcon!: Phaser.GameObjects.Image;
  private timeText!: Phaser.GameObjects.Text;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.Text;
  private bossStatus!: Phaser.GameObjects.Text;
  private bossShownHp = -1;
  /** HP shown on screen per hero; slides toward the real HP for a smooth "drain". */
  private shownHp: number[] = [];
  /**
   * HUD blocks that fade out when something important is underneath them
   * (your hero or an enemy), so the HUD never hides the action.
   */
  private fadeGroups: { rect: Phaser.Geom.Rectangle; objects: { setAlpha(a: number): unknown }[]; alpha: number }[] = [];
  private helpText!: Phaser.GameObjects.Text;
  /** On-screen joystick + buttons (phones only, null on desktop). */
  private touch: TouchControls | null = null;
  /** Controls were changed in the menu: rebuild this HUD when the game resumes. */
  private controlsDirty = false;

  constructor() {
    super('UI');
  }

  create(): void {
    this.shownHp = [];
    this.partyTexts = [];
    this.fadeGroups = [];
    this.bars = this.add.graphics();
    this.cooldowns = this.add.graphics();
    for (let i = 0; i < 3; i++) {
      this.partyTexts.push(this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: COLORS.uiText }));
    }

    // Action button labels (bottom-left).
    const y = GAME_HEIGHT - 44;
    // Key labels come from the player's bindings (Controls screen).
    const b = getControlSettings().bindings;
    const key = (k: keyof typeof b) => bindingLabel(b[k]).toUpperCase();
    this.label(48, y + 28, key('attack'));
    this.label(128, y + 28, key('skill'));
    this.label(208, y + 28, key('dodge'));
    this.label(284, y + 28, key('potionHp'));
    this.label(336, y + 28, key('potionMp'));
    this.controlsDirty = false;
    const onControls = () => (this.controlsDirty = true);
    this.game.events.on(CONTROLS_CHANGED, onControls);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(CONTROLS_CHANGED, onControls));
    this.skillTimer = this.add
      .text(128, y, '', { fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#ffffff', stroke: '#1a1422', strokeThickness: 3 })
      .setOrigin(0.5);
    this.potionTexts = [284, 336].map((px) =>
      this.add.text(px + 10, y + 8, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', stroke: '#1a1422', strokeThickness: 3 }),
    );
    this.skillName = this.add
      .text(128, y - 34, '', { fontFamily: 'monospace', fontSize: '11px', color: COLORS.uiAccent })
      .setOrigin(0.5);

    // Controls reminder: shown for a few seconds, then it fades away to keep the view clear.
    this.helpText = this.add
      .text(this.scale.width / 2, IS_TOUCH ? 96 : GAME_HEIGHT - 16, IS_TOUCH
        ? 'Left thumb: move    Hold ATK to combo    Tap a hero (top-left) to switch'
        : `${key('swap')} / 1-2-3: switch hero    ${key('potionHp')} / ${key('potionMp')}: potions    R: reset room    Esc: menu`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: COLORS.uiText,
        backgroundColor: '#00000088',
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5, 1);
    this.tweens.add({ targets: this.helpText, alpha: 0, delay: 6000, duration: 1000 });

    this.crosshair = this.add.image(0, 0, 'crosshair').setDepth(10);

    // Boss bar (drawn in update when a boss is fighting).
    this.bossShownHp = -1;
    this.bossBar = this.add.graphics();
    this.bossName = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#ffffff' });
    this.bossStatus = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffd23f' }).setOrigin(1, 0);

    // Collectibles row (top-right): coins, stars, key, time.
    // (On phones the pause button sits in the top-right corner, so the row moves left.)
    const rx = this.scale.width - (IS_TOUCH ? 62 : 18);
    const topRight: { setAlpha(a: number): unknown }[] = [];
    topRight.push(this.add.image(rx - 230, 40, 'coin'));
    this.coinText = this.add.text(rx - 218, 32, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffd23f' });
    topRight.push(this.add.image(rx - 160, 40, 'star'));
    this.starText = this.add.text(rx - 146, 32, '', { fontFamily: 'monospace', fontSize: '14px', color: '#fff27a' });
    this.keyIcon = this.add.image(rx - 90, 40, 'key').setVisible(false);
    this.timeText = this.add.text(rx, 32, '', { fontFamily: 'monospace', fontSize: '14px', color: COLORS.uiText }).setOrigin(1, 0);
    topRight.push(this.coinText, this.starText, this.keyIcon, this.timeText);

    // Element wheel reminder (top-right, under the help text).
    const ex = this.scale.width - 12;
    const parts: [string, string][] = [
      ['Fire', ELEMENT_COLOR.fire],
      [' > ', '#bbbbbb'],
      ['Earth', ELEMENT_COLOR.earth],
      [' > ', '#bbbbbb'],
      ['Water', ELEMENT_COLOR.water],
      [' > ', '#bbbbbb'],
      ['Fire', ELEMENT_COLOR.fire],
    ];
    let cursorX = ex;
    for (let i = parts.length - 1; i >= 0; i--) {
      const t = this.add
        .text(cursorX, 12, parts[i][0], { fontFamily: 'monospace', fontSize: '12px', color: parts[i][1] })
        .setOrigin(1, 0);
      cursorX -= t.width;
      topRight.push(t);
    }

    // A dark outline keeps these readable on any floor (e.g. bright snow).
    for (const o of topRight) if (o instanceof Phaser.GameObjects.Text) o.setStroke('#1a1422', 3);

    // Fade groups: party (top-left), collectibles (top-right), actions (bottom-left).
    const actionObjects = this.children.list.filter(
      (o) => o instanceof Phaser.GameObjects.Text && (o as Phaser.GameObjects.Text).y > GAME_HEIGHT - 100 && (o as Phaser.GameObjects.Text).x < 380,
    ) as Phaser.GameObjects.Text[];
    this.fadeGroups.push(
      { rect: new Phaser.Geom.Rectangle(0, 0, 200, 112), objects: [this.bars, ...this.partyTexts], alpha: 1 },
      { rect: new Phaser.Geom.Rectangle(this.scale.width - 270, 0, 270, 58), objects: topRight, alpha: 1 },
      { rect: new Phaser.Geom.Rectangle(0, GAME_HEIGHT - 110, 370, 110), objects: [this.cooldowns, ...actionObjects], alpha: 1 },
    );

    // Chain prompt (bottom-center), hidden until there is an opportunity.
    // On phones the bottom of the screen belongs to your thumbs, so the prompt goes near the top.
    this.chainPanel = this.add.container(this.scale.width / 2, IS_TOUCH ? 150 : GAME_HEIGHT - 70).setVisible(false);
    const bg = this.add.graphics();
    bg.fillStyle(0x2a0f2e, 0.92).fillRoundedRect(-170, -26, 340, 52, 10);
    bg.lineStyle(2, 0xff7af0, 1).strokeRoundedRect(-170, -26, 340, 52, 10);
    bg.fillStyle(0xff7af0).fillRoundedRect(-160, -16, 32, 32, 6);
    const keyText = this.add
      .text(-144, 0, IS_TOUCH ? 'TAP' : key('chain'), {
        fontFamily: 'monospace',
        fontSize: IS_TOUCH || key('chain').length > 1 ? '9px' : '20px',
        fontStyle: 'bold',
        color: '#2a0f2e',
      })
      .setOrigin(0.5);
    this.chainChip = this.add.rectangle(-112, 0, 12, 32, 0xffffff);
    this.chainText = this.add.text(-98, -15, '', { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff', fontStyle: 'bold' });
    this.chainSub = this.add.text(-98, 4, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffb8f5' });
    this.chainPanel.add([bg, keyText, this.chainChip, this.chainText, this.chainSub]);

    // "CHAIN x2" counter (right side, center).
    this.chainCount = this.add
      .text(this.scale.width - 40, GAME_HEIGHT / 2 - 40, '', {
        fontFamily: 'monospace',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#ff7af0',
        stroke: '#1a1422',
        strokeThickness: 5,
      })
      .setOrigin(1, 0.5);

    if (IS_TOUCH) this.createTouchControls();
  }

  /**
   * Phones: joystick on the left, action buttons on the right (like most mobile
   * action games). Desktop-only HUD bits (mouse crosshair, key labels) are hidden.
   */
  private createTouchControls(): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    // Positions, sizes, opacity and stick mode come from the player's layout (Controls screen).
    const layout = getControlSettings().touch;
    this.touch = new TouchControls(
      this,
      TOUCH_BUTTONS.map((d) => {
        const l = layout.buttons[d.id];
        return { id: d.id, x: l.x, y: l.y, r: d.r * l.scale, label: d.label, color: d.color };
      }),
      // Floating joystick zone: the left part of the screen, below the party rows.
      new Phaser.Geom.Rectangle(0, 120, W * 0.45, H - 120),
      { opacity: layout.opacity, stickMode: layout.stickMode, stickX: layout.stick.x, stickY: layout.stick.y, stickScale: layout.stick.scale },
    );
    stageTouch.current = this.touch;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (stageTouch.current === this.touch) stageTouch.current = null;
      this.touch = null;
    });

    // Tap a party row to take control of that hero.
    for (let i = 0; i < 3; i++) {
      this.add.zone(10, 8 + i * 34, 176, 30).setOrigin(0).setInteractive().on('pointerdown', () => this.touch?.tap(`hero${i}`));
    }

    // Hide the desktop-only parts.
    this.crosshair.setVisible(false);
    this.cooldowns.setVisible(false);
    for (const o of this.children.list) {
      const t = o as Phaser.GameObjects.Text;
      if (t instanceof Phaser.GameObjects.Text && t.y > GAME_HEIGHT - 100 && t.x < 380) t.setVisible(false); // key labels
      if (t instanceof Phaser.GameObjects.Text && t.y === 12) t.setVisible(false); // element wheel (no room)
    }
    // The chain prompt can be tapped too.
    this.chainPanel.setSize(340, 52).setInteractive().on('pointerdown', () => this.touch?.tap('chain'));
  }

  /** Show cooldowns, mana and counts on the touch buttons. */
  private updateTouch(stage: StageScene): void {
    const t = this.touch;
    if (!t) return;
    const leader = stage.party.leader;
    const potions = getSave().potions;
    t.setButton('skill', {
      cooldown: leader.skillCooldown / leader.skillCooldownMax,
      dim: leader.mana < leader.skillManaCost,
      sub: leader.skillCooldown > 0 ? leader.skillCooldown.toFixed(1) : '',
    });
    t.setButton('dodge', { cooldown: leader.dodgeCooldown / leader.dodgeCooldownMax });
    t.setButton('chain', { visible: !!stage.chain.opportunity });
    t.setButton('swap', { visible: stage.party.heroes.length > 1 });
    t.setButton('potionHp', { dim: potions.health <= 0, sub: `x${potions.health}` });
    t.setButton('potionMp', { dim: potions.mana <= 0, sub: `x${potions.mana}` });
    t.redraw();
  }

  update(_time: number, delta: number): void {
    // New controls from the menu? Rebuild the HUD (labels / touch buttons) now that we're running again.
    if (this.controlsDirty) {
      this.scene.restart();
      return;
    }
    const stage = this.scene.get('Stage') as StageScene;
    const party = stage.party;
    if (!party) return;

    this.drawBossBar(stage, delta);

    // Collectibles
    const run = stage.run;
    this.coinText.setText(String(run.coins));
    this.starText.setText(`${run.stars.length}/${STARS_PER_STAGE}`);
    this.keyIcon.setVisible(run.hasKey);
    const t = Math.floor(run.elapsed);
    this.timeText.setText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);

    // Crosshair follows the mouse (screen coordinates; this camera never moves).
    const p = this.input.activePointer;
    this.crosshair.setPosition(p.x, p.y);

    this.bars.clear();
    party.heroes.forEach((hero, i) => this.drawHeroPanel(hero, i, i === party.leaderSlot, delta));

    // --- Cooldown icons for the hero you control ---
    const leader = party.leader;
    const cy = GAME_HEIGHT - 44;
    const c = this.cooldowns.clear();
    this.cooldownIcon(c, 48, cy, 0, 0xffffff);
    // Skill icon: shows the cooldown pie, and turns blue-grey when there isn't enough mana.
    const cost = leader.skillManaCost;
    const enoughMana = leader.mana >= cost;
    this.cooldownIcon(c, 128, cy, leader.skillCooldown / leader.skillCooldownMax, enoughMana ? leader.def.accent : 0x4a5a7a);
    // The number in the icon = seconds until the skill is ready again.
    this.skillTimer.setText(leader.skillCooldown > 0 ? leader.skillCooldown.toFixed(1) : '');
    this.cooldownIcon(c, 208, cy, leader.dodgeCooldown / leader.dodgeCooldownMax, 0x9fd8ff);
    this.skillName.setText(`${leader.skillDef.name}  (${cost} MP)`);

    // Potions: a little bottle per kind with how many you carry.
    const potions = getSave().potions;
    this.potionIcon(c, 284, cy, 0xff5a7a, potions.health);
    this.potionIcon(c, 336, cy, 0x5a9aff, potions.mana);
    this.potionTexts[0].setText(`x${potions.health}`);
    this.potionTexts[1].setText(`x${potions.mana}`);

    // --- Chain prompt ---
    const opp = stage.chain.opportunity;
    this.chainPanel.setVisible(!!opp);
    if (opp) {
      const statusWord = opp.target.status === 'stun' ? 'STUNNED' : 'KNOCKED DOWN';
      this.chainChip.setFillStyle(opp.hero.def.color);
      this.chainText.setText(`CHAIN  ${opp.hero.def.name}: ${opp.hero.def.chain.name}`);
      this.chainSub.setText(`${opp.target.def.name} is ${statusWord}`);
      // Gentle pulse so it catches the eye.
      this.chainPanel.setScale(1 + Math.sin(this.time.now * 0.012) * 0.03);
    }
    const count = stage.chain.count;
    this.chainCount.setText(count >= 1 ? `CHAIN x${count}` : '');

    this.updateFades(stage, delta);
    this.updateTouch(stage);
  }

  /**
   * Fade a HUD block to 25% when the hero you control or an enemy is behind it.
   * We convert world positions to screen positions with the stage camera.
   */
  private updateFades(stage: StageScene, delta: number): void {
    const cam = stage.cameras.main;
    const points = [stage.party.leader, ...stage.enemies.filter((e) => !e.dead)].map((e) => ({
      x: (e.x - cam.worldView.x) * cam.zoom,
      y: (e.y - 16 - cam.worldView.y) * cam.zoom,
    }));
    const k = 1 - Math.exp(-10 * (delta / 1000));
    for (const g of this.fadeGroups) {
      const covered = points.some((p) => Phaser.Geom.Rectangle.Contains(g.rect, p.x, p.y));
      g.alpha = Phaser.Math.Linear(g.alpha, covered ? 0.25 : 1, k);
      for (const o of g.objects) o.setAlpha(g.alpha);
    }
  }

  /**
   * One compact party row: color chip, "1 Rook Lv.3", HP bar, mana bar, XP line.
   * Kept small (about 180 x 30 px) so it covers as little of the room as possible.
   */
  private drawHeroPanel(hero: Hero, i: number, isLeader: boolean, delta: number): void {
    const x = 10;
    const y = 8 + i * 34;
    const w = 176;
    const barW = 140;

    if (this.shownHp[i] === undefined) this.shownHp[i] = hero.hp;
    this.shownHp[i] = Phaser.Math.Linear(this.shownHp[i], hero.hp, 1 - Math.exp(-6 * (delta / 1000)));

    const g = this.bars;
    // Card (see-through) + gold outline for the hero you control
    g.fillStyle(0x000000, isLeader ? 0.55 : 0.4).fillRoundedRect(x, y, w, 30, 5);
    if (isLeader) g.lineStyle(1.5, 0xffd23f, 0.9).strokeRoundedRect(x, y, w, 30, 5);
    g.fillStyle(hero.def.color).fillRoundedRect(x + 5, y + 5, 12, 20, 3);

    // HP bar
    const bx = x + 26;
    const by = y + 16;
    const pct = hero.hp / hero.maxHp;
    g.fillStyle(0x1a1422).fillRect(bx - 1, by - 1, barW + 2, 6);
    g.fillStyle(0xffffff, 0.8).fillRect(bx, by, barW * (this.shownHp[i] / hero.maxHp), 4);
    g.fillStyle(hero.dead ? 0x555555 : pct > 0.3 ? 0x6ee06a : 0xff5a5a).fillRect(bx, by, barW * pct, 4);
    // Mana bar
    g.fillStyle(0x1a1422).fillRect(bx - 1, by + 5, barW + 2, 4);
    g.fillStyle(hero.dead ? 0x444444 : 0x5a9aff).fillRect(bx, by + 6, barW * (hero.mana / hero.maxMana), 2);
    // XP line
    const xp = levelFromXp(heroSave(hero.def.id).xp);
    g.fillStyle(0xb8f27a, 0.8).fillRect(bx, by + 10, barW * (xp.need > 0 ? xp.into / xp.need : 1), 1);

    const text = this.partyTexts[i];
    text
      .setPosition(bx, y + 2)
      .setText(`${i + 1} ${hero.def.name} Lv.${hero.level}${hero.dead ? ' KO' : ''}`)
      .setColor(hero.dead ? '#888888' : isLeader ? COLORS.uiAccent : COLORS.uiText);
    // Element dot after the name
    g.fillStyle(Phaser.Display.Color.HexStringToColor(ELEMENT_COLOR[hero.def.element]).color);
    g.fillCircle(bx + text.width + 6, y + 8, 3);
  }

  /**
   * The big boss bar (top-center): name, HP with a white "drain" part,
   * a tick at 50% (phase 2), and a thin ARMOR bar below. When the armor
   * breaks or the boss crashes, the bar shows "STUNNED - CHAIN NOW!".
   */
  private drawBossBar(stage: StageScene, delta: number): void {
    const boss = stage.boss;
    const show = !!boss && stage.bossBarVisible && boss.active && !boss.dead;
    this.bossName.setVisible(show);
    this.bossStatus.setVisible(show);
    const g = this.bossBar.clear();
    if (!show || !boss) return;

    const w = 380;
    const x = 475 - w / 2;
    const y = 30;
    if (this.bossShownHp < 0) this.bossShownHp = boss.hp;
    this.bossShownHp = Phaser.Math.Linear(this.bossShownHp, boss.hp, 1 - Math.exp(-4 * (delta / 1000)));

    g.fillStyle(0x000000, 0.6).fillRoundedRect(x - 8, y - 22, w + 16, 46, 8);
    g.fillStyle(0x1a1422).fillRect(x - 2, y - 2, w + 4, 16);
    g.fillStyle(0xffffff, 0.85).fillRect(x, y, w * (this.bossShownHp / boss.maxHp), 12);
    g.fillStyle(boss.phase === 2 ? 0xff3a2a : 0xff7a3a).fillRect(x, y, w * (boss.hp / boss.maxHp), 12);
    g.fillStyle(0xffffff, 0.8).fillRect(x + w / 2 - 1, y - 2, 2, 16); // phase 2 marker

    // Armor (poise) bar
    const armor = boss.status ? 0 : boss.poise / (boss.def.poise ?? 1);
    g.fillStyle(0x1a1422).fillRect(x - 2, y + 16, w + 4, 6);
    g.fillStyle(0xffd23f).fillRect(x, y + 17, w * armor, 4);

    this.bossName.setPosition(x, y - 19).setText(`${boss.def.name}${boss.phase === 2 ? '  (ENRAGED)' : ''}`);
    this.bossStatus
      .setPosition(x + w, y - 19)
      .setText(boss.status ? 'STUNNED - CHAIN NOW!' : 'ARMOR')
      .setColor(boss.status ? '#ff7af0' : '#ffd23f');
  }

  /** Round icon; `remaining` 0 = ready, 1 = just used. */
  private cooldownIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, remaining: number, color: number): void {
    const r = 20;
    g.fillStyle(0x1a1422).fillCircle(x, y, r + 3);
    g.fillStyle(color, remaining > 0 ? 0.35 : 0.9).fillCircle(x, y, r);
    if (remaining > 0) {
      // Pie slice covering the remaining fraction, starting from the top.
      const start = -Math.PI / 2;
      g.fillStyle(0x000000, 0.55);
      g.slice(x, y, r, start, start + Math.PI * 2 * remaining, false).fillPath();
    }
  }

  /** Small potion bottle; faded when you have none. */
  private potionIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, count: number): void {
    const a = count > 0 ? 1 : 0.3;
    g.fillStyle(0x1a1422).fillCircle(x, y + 3, 13).fillRect(x - 5, y - 16, 10, 10);
    g.fillStyle(color, a).fillCircle(x, y + 3, 10);
    g.fillStyle(0xd9c7a0, a).fillRect(x - 3, y - 14, 6, 7);
    g.fillStyle(0xffffff, 0.5 * a).fillCircle(x - 4, y, 3);
  }

  private label(x: number, y: number, text: string): void {
    this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: '11px', color: COLORS.uiText })
      .setOrigin(0.5, 0)
      .setAlpha(0.8);
  }
}
