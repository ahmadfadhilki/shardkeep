import type { Role } from './heroes';

/**
 * ATTACK, SKILL & CHAIN DATA
 * --------------------------
 * Each role has a 3-hit normal-attack combo and one weapon skill.
 * Each hero also has a chain skill (defined in heroes.ts, type below).
 * Tweak numbers here to change how each hero feels.
 */

/**
 * Statuses that open a chain-skill opportunity.
 *   stun - enemy is dizzy and can't act
 *   down - enemy is knocked flat on the ground
 */
export type Status = 'stun' | 'down';

/** How long each status lasts (seconds). This is the window for pressing F. */
export const STATUS_DURATION: Record<Status, number> = { stun: 2.4, down: 2.0 };

export type AttackKind = 'slash' | 'arrow' | 'bolt';

export interface ComboHit {
  kind: AttackKind;
  /** Damage multiplier on ATK. */
  power: number;
  /** Knockback speed (px/s). */
  knock: number;
  /** Seconds this hit lasts before you can act freely again. */
  duration: number;
  /** Step forward while attacking (negative = small hop backward). */
  lunge: number;
  /** Heavy hits stagger longer, show big numbers and break enemy armor faster. */
  heavy: boolean;
  /** Melee: reach in px. Projectiles: max travel distance in px. */
  range: number;
  /** Melee only: width of the swing in degrees. */
  arc?: number;
  /** Projectiles only: speed in px/s. */
  speed?: number;
  /** Projectiles only: passes through enemies instead of stopping at the first. */
  pierce?: boolean;
}

export type SkillKind = 'spin' | 'pierceShot' | 'healCircle';

export interface SkillDef {
  name: string;
  kind: SkillKind;
  cooldown: number;
  /** Mana cost at level 1 (levels make it cheaper, see progression.ts). */
  mana: number;
  power: number;
  knock: number;
  /** Area radius (spin / heal) or travel distance (shot). */
  radius: number;
  duration: number;
  /** Heal circle: fraction of each ally's max HP restored. */
  healPct?: number;
  /** Status applied to enemies hit (this is what starts chains!). */
  inflict?: Status;
}

/**
 * A chain skill can be triggered (F key) when an enemy has one of the `on`
 * statuses. It hits that enemy hard and may cause a NEW status, which can
 * open the door for the next hero's chain skill. That's the chain.
 */
export interface ChainDef {
  name: string;
  /** Usable when the target has one of these statuses. */
  on: Status[];
  /** Status this chain leaves on the target (null = ends the chain). */
  causes: Status | null;
  power: number;
  /** Splash radius around the target (other enemies take 40%). */
  radius: number;
  /** Optional: heal the whole party by this fraction of max HP. */
  healPct?: number;
}

/** Seconds before the same hero can chain again. */
export const CHAIN_COOLDOWN = 8;
/** Each step of a chain adds this much bonus damage (x1, x1.25, x1.5...). */
export const CHAIN_BONUS_PER_STEP = 0.25;

export const COMBOS: Record<Role, ComboHit[]> = {
  melee: [
    { kind: 'slash', power: 1.0, knock: 100, duration: 0.24, lunge: 130, heavy: false, range: 54, arc: 120 },
    { kind: 'slash', power: 1.1, knock: 110, duration: 0.24, lunge: 130, heavy: false, range: 54, arc: 120 },
    { kind: 'slash', power: 1.9, knock: 340, duration: 0.4, lunge: 190, heavy: true, range: 56, arc: 160 },
  ],
  ranged: [
    { kind: 'arrow', power: 0.8, knock: 70, duration: 0.22, lunge: -40, heavy: false, range: 380, speed: 620 },
    { kind: 'arrow', power: 0.8, knock: 70, duration: 0.22, lunge: -40, heavy: false, range: 380, speed: 620 },
    { kind: 'arrow', power: 1.4, knock: 240, duration: 0.38, lunge: -90, heavy: true, range: 420, speed: 720, pierce: true },
  ],
  healer: [
    { kind: 'bolt', power: 0.9, knock: 90, duration: 0.3, lunge: 0, heavy: false, range: 280, speed: 400 },
    { kind: 'bolt', power: 0.9, knock: 90, duration: 0.3, lunge: 0, heavy: false, range: 280, speed: 400 },
    { kind: 'bolt', power: 1.6, knock: 220, duration: 0.42, lunge: 0, heavy: true, range: 300, speed: 460 },
  ],
};

export const SKILLS: Record<Role, SkillDef> = {
  melee: { name: 'Flame Spin', kind: 'spin', cooldown: 5, mana: 30, power: 2.2, knock: 380, radius: 74, duration: 0.45, inflict: 'down' },
  ranged: { name: 'Tide Piercer', kind: 'pierceShot', cooldown: 6, mana: 35, power: 2.6, knock: 300, radius: 560, duration: 0.4, inflict: 'stun' },
  healer: { name: 'Grove Bloom', kind: 'healCircle', cooldown: 8, mana: 45, power: 0, knock: 0, radius: 150, duration: 0.5, healPct: 0.3 },
};
