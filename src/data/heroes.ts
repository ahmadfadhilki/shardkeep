/**
 * HERO DATA
 * ---------
 * Every playable hero is described here as plain data.
 * To add a new hero: copy one entry, give it a new `id`, and change the values.
 * Its normal attacks and weapon skill come from its `role` (see skills.ts);
 * its chain skill is defined right here.
 */
import type { ChainDef } from './skills';

export type Element = 'fire' | 'water' | 'earth';
export type Role = 'melee' | 'ranged' | 'healer';

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  /** Movement speed in pixels per second. */
  speed: number;
}

export interface HeroDef {
  id: string;
  name: string;
  role: Role;
  element: Element;
  /** Main color of the placeholder sprite. */
  color: number;
  /** Secondary color (hair / hat) of the placeholder sprite. */
  accent: number;
  /** Stats at level 1. */
  base: Stats;
  /**
   * What each level up gives (see data/progression.ts):
   *   hp       - extra max HP per level
   *   cooldown - skill cooldown shrinks by this fraction per level (0.03 = 3%)
   *   mana     - skill mana cost shrinks by this fraction per level
   */
  growth: { hp: number; cooldown: number; mana: number };
  /** Name of the weapon (upgraded in the town shop). */
  weapon: string;
  /** Name of the weapon skill (E). What it DOES comes from the role (see SKILLS in skills.ts). */
  skillName: string;
  /** Coins to recruit this hero in the shop. 0 = in your roster from the start. */
  price: number;
  /** One line about the hero, shown in the shop and party setup. */
  blurb: string;
  /** Chain skill: triggered with F when an enemy is stunned / knocked down. */
  chain: ChainDef;
}

export const HEROES: HeroDef[] = [
  {
    id: 'rook',
    name: 'Rook',
    role: 'melee',
    element: 'fire',
    color: 0xe0574a,
    accent: 0xffb347,
    base: { hp: 120, atk: 14, def: 6, speed: 190 },
    growth: { hp: 14, cooldown: 0.03, mana: 0.025 },
    weapon: 'Ember Blade',
    skillName: 'Flame Spin',
    price: 0,
    blurb: 'Hot-headed swordsman. Spins to knock foes DOWN.',
    // Stunned enemy -> Rook dives in and slams it to the ground.
    chain: { name: 'Inferno Dive', on: ['stun'], causes: 'down', power: 3.2, radius: 60 },
  },
  {
    id: 'wren',
    name: 'Wren',
    role: 'ranged',
    element: 'water',
    color: 0x4a8fe0,
    accent: 0xbfe6ff,
    base: { hp: 90, atk: 12, def: 4, speed: 200 },
    growth: { hp: 10, cooldown: 0.03, mana: 0.03 },
    weapon: 'Tide Bow',
    skillName: 'Tide Piercer',
    price: 0,
    blurb: 'Calm archer. Her piercing shot STUNS.',
    // Downed enemy -> Wren pins it with a water burst, leaving it stunned.
    chain: { name: 'Riptide Pin', on: ['down'], causes: 'stun', power: 3.0, radius: 60 },
  },
  {
    id: 'moss',
    name: 'Moss',
    role: 'healer',
    element: 'earth',
    color: 0x5fb85a,
    accent: 0xe8d27a,
    base: { hp: 100, atk: 9, def: 5, speed: 185 },
    growth: { hp: 12, cooldown: 0.025, mana: 0.03 },
    weapon: 'Grove Staff',
    skillName: 'Grove Bloom',
    price: 0,
    blurb: 'Gentle healer. Keeps the party standing.',
    // Finisher: works on any status, ends the chain, heals the party.
    chain: { name: 'Rootquake', on: ['stun', 'down'], causes: null, power: 3.4, radius: 80, healPct: 0.15 },
  },

  // ----- Heroes you can recruit in the town shop -----
  {
    id: 'brask',
    name: 'Brask',
    role: 'melee',
    element: 'earth',
    color: 0x9a7b4f,
    accent: 0x5fb85a,
    // A slow, sturdy fighter: lots of HP and DEF, less ATK.
    base: { hp: 165, atk: 12, def: 9, speed: 172 },
    growth: { hp: 19, cooldown: 0.025, mana: 0.025 },
    weapon: 'Stone Maul',
    skillName: 'Quake Spin',
    price: 150,
    blurb: 'Sturdy guardian. Huge HP, slow feet.',
    chain: { name: 'Boulder Crush', on: ['stun'], causes: 'down', power: 3.0, radius: 70 },
  },
  {
    id: 'cinder',
    name: 'Cinder',
    role: 'ranged',
    element: 'fire',
    color: 0xff8a3d,
    accent: 0xffe066,
    // Glass cannon: hits hard, falls fast.
    base: { hp: 78, atk: 15, def: 3, speed: 208 },
    growth: { hp: 8, cooldown: 0.035, mana: 0.03 },
    weapon: 'Flare Bow',
    skillName: 'Blaze Lance',
    price: 200,
    blurb: 'Reckless sharpshooter. High ATK, low HP.',
    chain: { name: 'Flare Volley', on: ['down'], causes: 'stun', power: 3.2, radius: 60 },
  },
  {
    id: 'nerri',
    name: 'Nerri',
    role: 'healer',
    element: 'water',
    color: 0x3fc1c9,
    accent: 0xf4ecff,
    base: { hp: 95, atk: 10, def: 5, speed: 195 },
    growth: { hp: 11, cooldown: 0.03, mana: 0.035 },
    weapon: 'Coral Wand',
    skillName: 'Tidal Grace',
    price: 250,
    blurb: 'Swift tide-priestess. Cheap, frequent heals.',
    chain: { name: 'Undertow', on: ['stun', 'down'], causes: null, power: 3.2, radius: 80, healPct: 0.2 },
  },
];

/** Most heroes allowed in a party. You may bring fewer (1 or 2) for a challenge. */
export const MAX_PARTY = 3;

/** Heroes you own when starting a New Game (price 0). */
export const STARTER_HEROES = HEROES.filter((h) => h.price === 0).map((h) => h.id);

/** Look up a hero definition by id (throws if the id is wrong, so typos are caught early). */
export function getHeroDef(id: string): HeroDef {
  const def = HEROES.find((h) => h.id === id);
  if (!def) throw new Error(`Unknown hero id: ${id}`);
  return def;
}
