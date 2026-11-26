import Phaser from 'phaser';
import { COLORS, IS_TOUCH } from '../config';
import { HEROES, type HeroDef } from '../data/heroes';
import { heroAtk, POTIONS, WEAPON_PRICES, type PotionDef } from '../data/progression';
import { getSave, heroSave, saveGame } from '../systems/SaveData';
import { Sfx } from '../systems/Sfx';
import { flushCloudSave } from '../services/saveService';
import { bindingLabel, getControlSettings } from '../systems/ControlSettings';
import { ConfirmDialog } from './ConfirmDialog';
import { Button, Panel, type PanelKey } from './Panel';

/** The player's key for a potion (they can rebind it). */
function potionKey(kind: 'health' | 'mana'): string {
  return bindingLabel(getControlSettings().bindings[kind === 'health' ? 'potionHp' : 'potionMp']) + ' key';
}

/** One line in the shop. Everything is a function so it always shows the current state. */
interface ShopItem {
  label: () => string;
  /** null = can't be bought (max level, bag full, already recruited). */
  price: () => number | null;
  description: () => string;
  /** Text on the button: Buy / Upgrade / Recruit. */
  verb: string;
  /** Question in the Yes/No box. */
  question: () => string;
  /** Give the item. Only called after the price was paid. */
  give: () => void;
  /** Why it can't be bought (shown when price() is null). */
  soldOutText: string;
}

type Tab = 'Potions' | 'Weapons' | 'Heroes';
const TABS: Tab[] = ['Potions', 'Weapons', 'Heroes'];
/** Rows that fit in the window. */
const MAX_ROWS = 6;

/**
 * Tilda's shop, in three tabs: potions, weapon upgrades, and heroes to recruit.
 *
 * Every row has its own button. Pressing it (click, or E/Enter on the selected
 * row) opens a Yes/No box first, so you never buy something by accident.
 * Keyboard: A/D = tab, W/S = row.
 */
export class ShopPanel extends Panel {
  private tab: Tab = 'Potions';
  private items: ShopItem[] = [];
  private tabButtons: Button[] = [];
  private rows: { name: Phaser.GameObjects.Text; price: Phaser.GameObjects.Text; button: Button }[] = [];
  private cursor!: Phaser.GameObjects.Rectangle;
  private coinsText!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private selected = 0;
  private readonly confirm: ConfirmDialog;

  constructor(scene: Phaser.Scene) {
    super(scene, 700, 430, "Tilda's Goods");
    const left = -this.width / 2 + 24;
    const top = -this.height / 2;
    this.coinsText = this.text(this.width / 2 - 24, top + 18, '', 16, '#ffd23f').setOrigin(1, 0);

    // Tabs
    TABS.forEach((tab, i) => {
      const b = new Button(scene, left + 60 + i * 130, top + 66, tab, () => this.setTab(tab), 120, 28, 0xc9bde0);
      this.tabButtons.push(b);
      this.root.add(b);
    });

    this.cursor = scene.add.rectangle(0, 0, this.width - 32, 38, 0xffcf5a, 0.12).setStrokeStyle(1, 0xffcf5a, 0.7);
    this.root.add(this.cursor);

    for (let i = 0; i < MAX_ROWS; i++) {
      const y = top + 112 + i * 42;
      const name = this.text(left, y - 9, '', 15);
      const price = this.text(this.width / 2 - 150, y - 9, '', 15, '#ffd23f').setOrigin(1, 0);
      const button = new Button(scene, this.width / 2 - 75, y, 'Buy', () => this.tryBuy(i), 100, 28);
      button.on('pointerover', () => this.select(i));
      name.setInteractive().on('pointerover', () => this.select(i));
      this.root.add(button);
      this.rows.push({ name, price, button });
    }

    this.info = this.text(left, this.height / 2 - 76, '', 13, '#c9bde0').setWordWrapWidth(this.width - 48);
    this.message = this.text(left, this.height / 2 - 36, '', 14, '#ffffff');
    this.confirm = new ConfirmDialog(scene);
    this.setTab('Potions');
  }

  // ---------------------------------------------------------------------------
  // The items in each tab
  // ---------------------------------------------------------------------------

  private buildItems(tab: Tab): ShopItem[] {
    const save = getSave();
    if (tab === 'Potions') return POTIONS.map((p) => this.potionItem(p));
    if (tab === 'Weapons') return HEROES.filter((h) => save.roster.includes(h.id)).map((h) => this.weaponItem(h));
    return HEROES.filter((h) => h.price > 0).map((h) => this.heroItem(h));
  }

  private potionItem(p: PotionDef): ShopItem {
    return {
      label: () => `${p.name}  (have ${getSave().potions[p.kind]}/${p.max})`,
      price: () => (getSave().potions[p.kind] >= p.max ? null : p.price),
      description: () => `${p.description} Use it in a stage with ${IS_TOUCH ? `the ${p.kind === 'health' ? 'HP' : 'MP'} button` : 'the ' + potionKey(p.kind)}.`,
      verb: 'Buy',
      question: () => `Buy a ${p.name} for ${p.price} coins?`,
      give: () => getSave().potions[p.kind]++,
      soldOutText: "Your bag can't hold any more of those.",
    };
  }

  private weaponItem(h: HeroDef): ShopItem {
    const level = () => heroSave(h.id).weapon;
    const maxed = () => level() >= WEAPON_PRICES.length;
    return {
      label: () => (maxed() ? `${h.name}: ${h.weapon} +${level()} (MAX)` : `${h.name}: ${h.weapon} +${level()} > +${level() + 1}`),
      price: () => WEAPON_PRICES[level()] ?? null,
      description: () =>
        maxed()
          ? `ATK ${heroAtk(h, level())}. It can't get any sharper.`
          : `ATK ${heroAtk(h, level())} -> ${heroAtk(h, level() + 1)}. Weapon upgrades are the only way to raise ATK.`,
      verb: 'Upgrade',
      question: () => `Upgrade ${h.name}'s ${h.weapon} to +${level() + 1} for ${WEAPON_PRICES[level()]} coins?`,
      give: () => heroSave(h.id).weapon++,
      soldOutText: 'That weapon is already fully upgraded.',
    };
  }

  private heroItem(h: HeroDef): ShopItem {
    const owned = () => getSave().roster.includes(h.id);
    return {
      label: () => `${h.name}  ${h.role} / ${h.element}${owned() ? '  (in roster)' : ''}`,
      price: () => (owned() ? null : h.price),
      description: () => `${h.blurb}  HP ${h.base.hp}, ATK ${h.base.atk}, skill: ${h.skillName}, chain: ${h.chain.name}.`,
      verb: 'Recruit',
      question: () => `Recruit ${h.name} for ${h.price} coins?`,
      give: () => getSave().roster.push(h.id),
      soldOutText: `${h.name} already joined you. Set up your party with Elder Bram.`,
    };
  }

  // ---------------------------------------------------------------------------
  // Drawing and input
  // ---------------------------------------------------------------------------

  private setTab(tab: Tab): void {
    if (tab !== this.tab) Sfx.play('uiMove');
    this.tab = tab;
    this.items = this.buildItems(tab);
    this.selected = 0;
    this.message.setText('');
    this.refresh();
  }

  refresh(): void {
    const coins = getSave().coins;
    this.coinsText.setText(`Coins: ${coins}`);
    this.tabButtons.forEach((b, i) => b.setHighlight(TABS[i] === this.tab));

    this.rows.forEach((row, i) => {
      const item = this.items[i];
      const visible = !!item;
      row.name.setVisible(visible);
      row.price.setVisible(visible);
      row.button.setVisible(visible);
      if (!item) return;
      const price = item.price();
      row.name.setText(item.label()).setColor(price === null ? '#777777' : COLORS.uiText);
      row.price.setText(price === null ? '-' : `${price} c`).setColor(price !== null && price <= coins ? '#ffd23f' : '#a06a6a');
      row.button.setText(price === null ? 'Done' : item.verb).setEnabled(price !== null && price <= coins);
    });

    const row = this.rows[this.selected];
    this.cursor.setVisible(this.items.length > 0).setPosition(0, row.button.y);
    this.info.setText(this.items.length ? this.items[this.selected].description() : 'Nothing here yet.');
  }

  private select(i: number): void {
    if (this.confirm.isOpen || this.items.length === 0) return;
    const next = Phaser.Math.Wrap(i, 0, this.items.length);
    if (next !== this.selected) Sfx.play('uiMove');
    this.selected = next;
    this.refresh();
  }

  /** Button pressed: check we CAN buy, then ask "are you sure?". */
  private tryBuy(i: number): void {
    const item = this.items[i];
    if (!item || this.confirm.isOpen) return;
    this.selected = i;
    const price = item.price();
    const save = getSave();
    if (price === null) return this.say(item.soldOutText, '#ff9b9b', true);
    if (save.coins < price) return this.say(`Not enough coins (need ${price - save.coins} more).`, '#ff9b9b', true);
    Sfx.play('uiConfirm');
    this.confirm.ask(item.question(), () => {
      save.coins -= price;
      item.give();
      saveGame();
      void flushCloudSave(); // purchases go to the cloud immediately
      Sfx.play('buy');
      this.say('Thank you! Come again.', '#b8f27a');
      if (this.tab === 'Heroes') this.say(`${item.label().split(' ')[0]} joined your roster! Set up your party with Elder Bram (Tab).`, '#b8f27a');
      this.refresh();
    });
  }

  private say(text: string, color: string, error = false): void {
    if (error) Sfx.play('uiError');
    this.message.setText(text).setColor(color).setAlpha(1);
    this.scene.tweens.killTweensOf(this.message);
    this.scene.tweens.add({ targets: this.message, alpha: 0, delay: 2200, duration: 400 });
  }

  handleKey(key: PanelKey): void {
    // While the Yes/No box is open, it gets all the keys.
    if (this.confirm.isOpen) return this.confirm.handleKey(key);
    if (key === 'up') this.select(this.selected - 1);
    else if (key === 'down') this.select(this.selected + 1);
    else if (key === 'left') this.setTab(TABS[Phaser.Math.Wrap(TABS.indexOf(this.tab) - 1, 0, TABS.length)]);
    else if (key === 'right') this.setTab(TABS[Phaser.Math.Wrap(TABS.indexOf(this.tab) + 1, 0, TABS.length)]);
    else if (key === 'confirm') this.tryBuy(this.selected);
    else super.handleKey(key);
  }

  open(): void {
    this.items = this.buildItems(this.tab); // roster may have changed
    super.open();
  }
}
