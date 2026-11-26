/**
 * ENEMY DATA
 * ----------
 * Each enemy type is plain data. `symbol` is the character you type in a room
 * layout (see stages.ts) to place that enemy.
 *
 * To add a new enemy that behaves like an existing one, just add an entry here
 * with a new id + symbol. A new *behavior* needs a new class in entities/enemies/.
 */
import type { Element } from './heroes';

/** Which AI class runs this enemy (see entities/enemies/createEnemy.ts). */
export type EnemyBehavior = 'chaser' | 'shooter' | 'tank' | 'boss';
/** Which placeholder shape BootScene draws. */
export type EnemyShape = 'blob' | 'wisp' | 'shell' | 'golem';

export interface EnemyDef {
  id: string;
  name: string;
  /** Character used in ASCII room layouts. Must be unique and not '#', '.', 'P', 'o'. */
  symbol: string;
  behavior: EnemyBehavior;
  shape: EnemyShape;
  element: Element;
  color: number;
  accent: number;
  /** Body radius in pixels (used for drawing and hit detection). */
  radius: number;

  hp: number;
  atk: number;
  def: number;
  /** Chase speed in px/s. */
  speed: number;

  /** Starts chasing when a hero is closer than this (px). */
  aggroRange: number;
  /** Starts its attack wind-up when this close (px). */
  attackRange: number;
  /** Seconds of telegraph (warning) before the attack. Longer = easier to dodge. */
  windup: number;
  /** Seconds the enemy rests after attacking. */
  attackCooldown: number;
  /** Damage multiplier of its attack. */
  attackPower: number;

  /** 0..1: how much knockback is ignored (1 = immovable). */
  knockbackResist?: number;
  /**
   * Armor ("poise"): hits wear it down (heavy hits count 1, normal hits 1/3).
   * While armor holds, hits do NOT interrupt the enemy. When it breaks, the
   * enemy is stunned. Leave undefined for enemies that flinch from every hit.
   */
  poise?: number;

  /** Chaser: lunge speed (px/s). */
  lungeSpeed?: number;
  /** Shooter: projectile speed / count / spread between shots (degrees). */
  shotSpeed?: number;
  shotCount?: number;
  shotSpread?: number;
  /** Tank: radius of the slam attack (px). */
  slamRadius?: number;

  /** Rewards (used in Step 7). */
  xp: number;
  coins: number;
}

export const ENEMIES: EnemyDef[] = [
  {
    id: 'chaser',
    name: 'Bramble Slime',
    symbol: 'c',
    behavior: 'chaser',
    shape: 'blob',
    element: 'earth',
    color: 0x7f9a3c,
    accent: 0xcfe58a,
    radius: 12,
    hp: 60,
    atk: 10,
    def: 2,
    speed: 95,
    aggroRange: 230,
    attackRange: 60,
    windup: 0.45,
    attackCooldown: 0.8,
    attackPower: 1,
    lungeSpeed: 340,
    xp: 10,
    coins: 3,
  },
  {
    id: 'shooter',
    name: 'Ember Wisp',
    symbol: 'w',
    behavior: 'shooter',
    shape: 'wisp',
    element: 'fire',
    color: 0xff7a3a,
    accent: 0xffe08a,
    radius: 11,
    hp: 45,
    atk: 9,
    def: 1,
    speed: 80,
    aggroRange: 300,
    attackRange: 250,
    windup: 0.65,
    attackCooldown: 1.5,
    attackPower: 1,
    shotSpeed: 230,
    shotCount: 3,
    shotSpread: 14,
    xp: 12,
    coins: 4,
  },
  {
    id: 'tank',
    name: 'Tide Shell',
    symbol: 't',
    behavior: 'tank',
    shape: 'shell',
    element: 'water',
    color: 0x3a7fc8,
    accent: 0x9fd8ff,
    radius: 20,
    hp: 220,
    atk: 16,
    def: 8,
    speed: 55,
    aggroRange: 240,
    attackRange: 72,
    windup: 0.9,
    attackCooldown: 1.4,
    attackPower: 1.4,
    knockbackResist: 0.85,
    poise: 3,
    slamRadius: 84,
    xp: 30,
    coins: 10,
  },
  {
    // THE BOSS. Its attack patterns live in entities/enemies/Boss.ts.
    id: 'boss',
    name: 'Ashen Warden',
    symbol: 'K',
    behavior: 'boss',
    shape: 'golem',
    element: 'fire',
    color: 0x6e3b32,
    accent: 0xff8a3a,
    radius: 28,
    hp: 2600,
    atk: 18,
    def: 8,
    speed: 70,
    aggroRange: 900,
    attackRange: 0,
    windup: 1.0,
    attackCooldown: 0.8,
    attackPower: 1.3,
    knockbackResist: 1,
    poise: 18,
    xp: 200,
    coins: 60,
  },
];

/** Find the enemy type for a layout character, or undefined if it is not an enemy. */
export function getEnemyBySymbol(symbol: string): EnemyDef | undefined {
  return ENEMIES.find((e) => e.symbol === symbol);
}
