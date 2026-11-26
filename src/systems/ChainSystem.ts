import Phaser from 'phaser';
import type { Hero } from '../entities/Hero';
import type { Enemy } from '../entities/Enemy';
import type { PartyManager } from './PartyManager';
import { CHAIN_COOLDOWN } from '../data/skills';
import { popText } from './Effects';

/** A chain skill that could be used right now. */
export interface ChainOpportunity {
  hero: Hero;
  target: Enemy;
}

/** How far (from the leader) a stunned/downed enemy can be to be chain-able. */
const CHAIN_REACH = 420;
/** Seconds after the last chain hit before the chain counter resets. */
const CHAIN_RESET = 3.5;

/**
 * ChainSystem: the "combo between heroes" mechanic.
 *
 * 1. A skill stuns or knocks down an enemy (e.g. Wren's Tide Piercer -> STUN).
 * 2. Every frame we look for a party member whose chain skill works on that
 *    status (e.g. Rook's Inferno Dive works on STUN). That's an "opportunity",
 *    and the UI shows a prompt.
 * 3. The player presses F: that hero dashes in and hits hard. Its chain may
 *    leave a NEW status (Inferno Dive -> DOWN), which can open the next
 *    hero's chain (Wren's Riptide Pin works on DOWN). Each step adds bonus damage.
 */
export class ChainSystem {
  /** Chain hits in the current sequence (0 = no chain going). */
  count = 0;
  /** Current opportunity (read by the UI), or null. */
  opportunity: ChainOpportunity | null = null;

  private resetTimer = 0;
  private cooldowns = new Map<Hero, number>();

  constructor(private readonly scene: Phaser.Scene) {}

  /** Seconds until `hero` can chain again. */
  cooldownOf(hero: Hero): number {
    return this.cooldowns.get(hero) ?? 0;
  }

  update(dt: number, party: PartyManager, enemies: Enemy[]): void {
    for (const [hero, cd] of this.cooldowns) this.cooldowns.set(hero, Math.max(0, cd - dt));

    if (this.count > 0) {
      this.resetTimer -= dt;
      if (this.resetTimer <= 0) this.count = 0;
    }

    this.opportunity = this.findOpportunity(party, enemies);
  }

  /** Called when the player presses F. Returns true if a chain skill fired. */
  trigger(): boolean {
    const opp = this.opportunity;
    if (!opp) return false;
    if (!opp.hero.performChain(opp.target, this.count)) return false;

    this.count++;
    this.resetTimer = CHAIN_RESET;
    this.cooldowns.set(opp.hero, CHAIN_COOLDOWN);
    popText(this.scene, opp.target.x, opp.target.y - 60, `${opp.hero.def.chain.name}!`, '#ff7af0', 18);
    this.opportunity = null;
    return true;
  }

  /**
   * Pick ONE chain to offer (one prompt + one key keeps it simple: press F).
   * Priority:
   *   1. Chains that CONTINUE the sequence (they cause a new status) come first,
   *      so the player can keep chaining. Finishers come last.
   *   2. Within each group, party order starting from the leader.
   */
  private findOpportunity(party: PartyManager, enemies: Enemy[]): ChainOpportunity | null {
    // While a hero is still dashing in, wait for its hit to land (the hit sets
    // the new status). As soon as it lands, the next chain can be offered.
    if (party.heroes.some((h) => h.isChainDashing)) return null;

    const n = party.heroes.length;
    const ordered = Array.from({ length: n }, (_, k) => party.heroes[(party.leaderSlot + k) % n]);
    const continuing = ordered.filter((h) => h.def.chain.causes !== null);
    const finishers = ordered.filter((h) => h.def.chain.causes === null);

    for (const hero of [...continuing, ...finishers]) {
      if (hero.dead || hero.isChaining || this.cooldownOf(hero) > 0) continue;
      const target = this.findTarget(hero, party.leader, enemies);
      if (target) return { hero, target };
    }
    return null;
  }

  /** Nearest enemy (to the leader) whose status this hero's chain works on. */
  private findTarget(hero: Hero, leader: Hero, enemies: Enemy[]): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = CHAIN_REACH;
    for (const e of enemies) {
      if (e.dead || !e.status || !hero.def.chain.on.includes(e.status)) continue;
      const d = Phaser.Math.Distance.Between(leader.x, leader.y, e.x, e.y);
      if (d < bestDist) {
        best = e;
        bestDist = d;
      }
    }
    return best;
  }
}
