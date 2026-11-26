import Phaser from 'phaser';
import { COLORS } from '../config';
import { HEROES, MAX_PARTY, type HeroDef } from '../data/heroes';
import { SKILLS } from '../data/skills';
import { heroAtk, heroMaxHp, levelFromXp, MAX_LEVEL, skillCooldownAt, skillManaAt } from '../data/progression';
import { getParty, getSave, heroSave, saveGame } from '../systems/SaveData';
import { Sfx } from '../systems/Sfx';
import { Button, Panel, type PanelKey } from './Panel';

const COLS = 3;
const CARD_W = 140;
const CARD_H = 92;

/**
 * PARTY SETUP (Elder Bram, or Tab in town).
 *
 * Left: every hero as a card. Owned heroes can join the party; heroes you
 * haven't recruited yet are greyed out (buy them at Tilda's shop).
 * Right: details of the selected hero, plus buttons:
 *   [Add / Remove]  put the hero in or out of the party (1 to 3 heroes)
 *   [Make leader]   slot 1 = the hero you control when a stage starts
 *
 * Keyboard: arrows/WASD pick a hero, E = add/remove, Q = make leader, Esc = close.
 */
export class PartyPanel extends Panel {
  private selected = 0;
  private cards: { box: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; badge: Phaser.GameObjects.Text }[] = [];
  private details!: Phaser.GameObjects.Text;
  private detailBars!: Phaser.GameObjects.Graphics;
  private partyLine!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private toggleButton!: Button;
  private leaderButton!: Button;
  /** Called when the party changes (the hub redraws the walking party). */
  onPartyChanged: () => void = () => {};

  constructor(scene: Phaser.Scene) {
    super(scene, 800, 440, 'Party Setup');
    const left = -this.width / 2 + 24;
    const top = -this.height / 2 + 54;

    HEROES.forEach((_h, i) => {
      const x = left + (i % COLS) * (CARD_W + 10);
      const y = top + Math.floor(i / COLS) * (CARD_H + 10);
      const box = scene.add.graphics();
      const text = this.text(x + 34, y + 10, '', 12).setLineSpacing(3);
      const badge = this.text(x + CARD_W - 8, y + 8, '', 12, '#1a1422').setOrigin(1, 0);
      badge.setBackgroundColor('#ffcf5a').setPadding(4, 1, 4, 1);
      this.root.add(box);
      this.root.bringToTop(text);
      this.root.bringToTop(badge);
      // Click / tap a card to see that hero; the buttons on the right add, remove, or make leader.
      const zone = scene.add.zone(x + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.select(i));
      this.root.add(zone);
      box.setData('x', x).setData('y', y);
      this.cards.push({ box, text, badge });
    });

    const rx = this.width / 2 - 330;
    this.detailBars = scene.add.graphics();
    this.root.add(this.detailBars);
    this.details = this.text(rx, top, '', 12).setLineSpacing(3).setWordWrapWidth(310);
    this.toggleButton = new Button(scene, rx + 70, this.height / 2 - 92, 'Add', () => this.toggle(), 140, 30);
    this.leaderButton = new Button(scene, rx + 230, this.height / 2 - 92, 'Make leader', () => this.makeLeader(), 140, 30, 0xc9bde0);
    this.root.add([this.toggleButton, this.leaderButton]);

    this.partyLine = this.text(left, this.height / 2 - 66, '', 14, COLORS.uiAccent);
    this.message = this.text(left, this.height / 2 - 40, '', 12, '#c9bde0').setWordWrapWidth(this.width - 180);
    this.text(left, top + 2 * (CARD_H + 10) + 4, 'E: add/remove   Q: make leader\nFewer heroes = a harder (and braver) run!', 11, '#c9bde0').setAlpha(0.8);
  }

  private get hero(): HeroDef {
    return HEROES[this.selected];
  }

  refresh(): void {
    const save = getSave();
    const party = getParty();

    this.cards.forEach((card, i) => {
      const h = HEROES[i];
      const owned = save.roster.includes(h.id);
      const slot = party.indexOf(h.id);
      const x = card.box.getData('x') as number;
      const y = card.box.getData('y') as number;
      const g = card.box.clear();
      g.fillStyle(slot >= 0 ? 0x3a2f4e : 0xffffff, slot >= 0 ? 1 : 0.05).fillRoundedRect(x, y, CARD_W, CARD_H, 8);
      if (i === this.selected) g.lineStyle(2, 0xffcf5a, 1).strokeRoundedRect(x, y, CARD_W, CARD_H, 8);
      g.fillStyle(owned ? h.color : 0x444444).fillRoundedRect(x + 8, y + 10, 18, 24, 4);
      g.fillStyle(owned ? h.accent : 0x555555).fillRect(x + 8, y + 10, 18, 6);

      const lv = levelFromXp(heroSave(h.id).xp).level;
      card.text
        .setText(owned ? `${h.name}\nLv.${lv}\n${h.role}\n${h.element}` : `${h.name}\n\nnot recruited\n(${h.price} c)`)
        .setColor(owned ? COLORS.uiText : '#666666');
      card.badge.setVisible(slot >= 0).setText(slot === 0 ? 'LEAD' : String(slot + 1));
    });

    // --- Details of the selected hero ---
    const h = this.hero;
    const owned = save.roster.includes(h.id);
    const hs = heroSave(h.id);
    const { level, into, need } = levelFromXp(hs.xp);
    const skill = SKILLS[h.role];
    const statusWord = (s: string[]) => s.map((x) => x.toUpperCase()).join('/');
    this.details.setText([
      `${h.name}  -  ${h.role}, ${h.element}`,
      h.blurb,
      '',
      `Lv.${level}   ${level >= MAX_LEVEL ? 'MAX' : `XP ${into}/${need}`}`,
      '',
      `Max HP  ${heroMaxHp(h, level)}`,
      `ATK     ${heroAtk(h, hs.weapon)}  (${h.weapon} +${hs.weapon})`,
      `DEF     ${h.base.def}    Speed ${h.base.speed}`,
      `Skill   ${h.skillName}: ${skillCooldownAt(h, skill, level).toFixed(1)}s, ${skillManaAt(h, skill, level)} mana`,
      `Chain   ${h.chain.name}: on ${statusWord(h.chain.on)}${h.chain.causes ? ` -> ${h.chain.causes.toUpperCase()}` : ' (finisher)'}`,
    ].join('\n'));
    const g = this.detailBars.clear();
    g.fillStyle(0x000000, 0.6).fillRect(this.details.x, this.details.y + 62, 300, 6);
    g.fillStyle(0xb8f27a).fillRect(this.details.x, this.details.y + 62, level >= MAX_LEVEL ? 300 : 300 * (into / need), 6);

    const inParty = party.includes(h.id);
    this.toggleButton.setText(inParty ? 'Remove' : 'Add to party').setEnabled(owned && (inParty ? party.length > 1 : party.length < MAX_PARTY));
    this.leaderButton.setEnabled(inParty && party[0] !== h.id);

    this.partyLine.setText(`Party (${party.length}/${MAX_PARTY}):  ${party.map((id, i) => HEROES.find((x) => x.id === id)!.name + (i === 0 ? ' (leader)' : '')).join(',  ')}`);
  }

  private select(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    Sfx.play('uiMove');
    this.refresh();
  }

  /** Add the selected hero to the party, or take them out. */
  private toggle(): void {
    const save = getSave();
    const party = getParty();
    const h = this.hero;
    if (!save.roster.includes(h.id)) return this.say(`Recruit ${h.name} at Tilda's shop first.`, true);
    if (party.includes(h.id)) {
      if (party.length <= 1) return this.say('You need at least one hero!', true);
      save.party = party.filter((id) => id !== h.id);
      this.say(`${h.name} will wait in town.`);
    } else {
      if (party.length >= MAX_PARTY) return this.say(`The party is full (${MAX_PARTY}). Remove someone first.`, true);
      save.party = [...party, h.id];
      this.say(`${h.name} joined the party!`);
    }
    this.commit();
  }

  private makeLeader(): void {
    const party = getParty();
    const h = this.hero;
    if (!party.includes(h.id) || party[0] === h.id) return;
    getSave().party = [h.id, ...party.filter((id) => id !== h.id)];
    this.say(`${h.name} now leads the party.`);
    this.commit();
  }

  private commit(): void {
    saveGame();
    Sfx.play('uiConfirm');
    this.refresh();
    this.onPartyChanged();
  }

  private say(text: string, error = false): void {
    if (error) Sfx.play('uiError');
    this.message.setText(text).setColor(error ? '#ff9b9b' : '#b8f27a');
  }

  handleKey(key: PanelKey): void {
    const n = HEROES.length;
    if (key === 'left') this.select(Phaser.Math.Wrap(this.selected - 1, 0, n));
    else if (key === 'right') this.select(Phaser.Math.Wrap(this.selected + 1, 0, n));
    else if (key === 'up') this.select(Phaser.Math.Wrap(this.selected - COLS, 0, n));
    else if (key === 'down') this.select(Phaser.Math.Wrap(this.selected + COLS, 0, n));
    else if (key === 'confirm') this.toggle();
    else if (key === 'alt') this.makeLeader();
    else super.handleKey(key);
  }

  open(): void {
    this.message.setText('');
    super.open();
  }
}
