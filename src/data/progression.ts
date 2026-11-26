import type { HeroDef } from './heroes';
import type { SkillDef } from './skills';

/**
 * PROGRESSION DATA
 * ----------------
 * Levels, mana, the shop, and stage rewards. All plain numbers: tweak freely.
 *
 * What a level gives (kept simple on purpose):
 *   - more max HP              (HeroDef.growth.hp per level)
 *   - shorter skill cooldown   (HeroDef.growth.cooldown, e.g. 0.03 = 3% per level)
 *   - cheaper skill mana cost  (HeroDef.growth.mana,     e.g. 0.03 = 3% per level)
 *
 * ATK does NOT grow with levels. To hit harder, buy weapon upgrades in town.
 * So: players who want a challenge can stay low level, and players who want
 * to crush the boss can grind levels + upgrades.
 */

export const MAX_LEVEL = 20;

/** XP needed to go from `level` to `level + 1`. Lv1->2 = 50, Lv2->3 = 90, ... */
export function xpToNext(level: number): number {
  return 50 + 40 * (level - 1);
}

/** Total XP needed to REACH `level` (Lv1 = 0). */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

/**
 * Turn a hero's lifetime XP into a level plus progress toward the next one.
 * We only store total XP in the save file; the level is always computed from it,
 * so the two can never get out of sync.
 */
export function levelFromXp(totalXp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = totalXp;
  while (level < MAX_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, into: 0, need: 0 };
  return { level, into: rest, need: xpToNext(level) };
}

/** Never shrink cooldowns / mana costs below this fraction of the base value. */
const MIN_FRACTION = 0.5;

export function heroMaxHp(def: HeroDef, level: number): number {
  return def.base.hp + def.growth.hp * (level - 1);
}

export function skillCooldownAt(def: HeroDef, skill: SkillDef, level: number): number {
  return skill.cooldown * Math.max(MIN_FRACTION, 1 - def.growth.cooldown * (level - 1));
}

export function skillManaAt(def: HeroDef, skill: SkillDef, level: number): number {
  return Math.round(skill.mana * Math.max(MIN_FRACTION, 1 - def.growth.mana * (level - 1)));
}

/**
 * MANA: every hero has their own mana bar. Skills (E) cost mana.
 * It refills slowly by itself and faster when you land normal hits,
 * so attacking feeds your skills.
 */
export const MANA = {
  max: 100,
  /** Mana per second, always. */
  regen: 4,
  /** Extra mana each time one of your attacks hits an enemy. */
  perHit: 3,
};

/** Bonus XP (to every hero) for clearing a stage. */
export const STAGE_CLEAR_XP = 80;

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export type PotionKind = 'health' | 'mana';

export interface PotionDef {
  kind: PotionKind;
  name: string;
  price: number;
  /** How many you can carry. */
  max: number;
  /** Health: fraction of max HP healed. Mana: mana restored. */
  amount: number;
  /** Key used in a stage (shown in the HUD). */
  key: string;
  description: string;
}

export const POTIONS: PotionDef[] = [
  { kind: 'health', name: 'Health Potion', price: 30, max: 5, amount: 0.5, key: 'Z', description: 'Heals the hero you control by 50% HP.' },
  { kind: 'mana', name: 'Mana Potion', price: 25, max: 5, amount: 100, key: 'X', description: 'Refills the mana of the hero you control.' },
];

/** Weapon upgrades: each level adds this much ATK (0.12 = +12% of base ATK). */
export const WEAPON_ATK_PER_LEVEL = 0.12;
/** Price of upgrade #1, #2, ... The list length is the max weapon level. */
export const WEAPON_PRICES = [60, 110, 180, 270, 380];

export function heroAtk(def: HeroDef, weaponLevel: number): number {
  return Math.round(def.base.atk * (1 + WEAPON_ATK_PER_LEVEL * weaponLevel));
}
