import Phaser from 'phaser';
import type { Hero, HeroIntent } from '../entities/Hero';
import type { Enemy } from '../entities/Enemy';
import type { Entity } from '../entities/Entity';
import type { CombatSystem } from './CombatSystem';

/**
 * CompanionAI: the "brain" for a hero the player is NOT controlling.
 *
 * Every frame it looks at the situation and fills in a HeroIntent, exactly
 * like the keyboard/mouse does for the player's hero. Priorities, top first:
 *
 *   1. Too far from the leader?  -> run back (regroup)
 *   2. An enemy is about to hit me? -> dodge (most of the time)
 *   3. Healer + an ally is hurt?  -> cast the heal skill
 *   4. Enemy nearby?              -> fight it, in a way that suits my role
 *   5. Nothing to do?             -> follow the leader in formation
 */

/** How each role likes to fight. min/max = preferred distance from the target. */
const ROLE_RANGE = {
  melee: { min: 0, max: 42 },
  ranged: { min: 110, max: 190 },
  healer: { min: 130, max: 210 },
} as const;

/** Only engage enemies this close to me... */
const ENGAGE_RANGE = 260;
/** ...and this close to the leader (so companions don't wander off). */
const LEASH_RANGE = 340;
/** Farther than this from the leader = stop fighting and run back. */
const REGROUP_RANGE = 300;

export class CompanionAI {
  private readonly intent: HeroIntent = {
    move: new Phaser.Math.Vector2(),
    aim: new Phaser.Math.Vector2(),
    attack: false,
    attackHeld: false,
    skill: false,
    dodge: false,
  };
  private target: Entity | null = null;
  private retargetTimer = 0;
  /** -1 = left side of the formation, +1 = right side. */
  private side: number;
  /** Direction the leader last walked in (formation forms behind this). */
  private trail = new Phaser.Math.Vector2(0, 1);

  constructor(
    private readonly hero: Hero,
    private readonly combat: CombatSystem,
    side: number,
  ) {
    this.side = side;
  }

  /** Decide what to do this frame. */
  think(dt: number, leader: Hero): HeroIntent {
    const i = this.intent;
    const h = this.hero;
    i.move.set(0, 0);
    i.attack = i.attackHeld = i.skill = i.dodge = false;
    h.speedBoost = 1;

    const leaderVel = leader.body.velocity;
    if (leaderVel.lengthSq() > 400) this.trail.copy(leaderVel).normalize();

    // 1. Regroup when too far from the leader.
    const distLeader = Phaser.Math.Distance.Between(h.x, h.y, leader.x, leader.y);
    if (distLeader > REGROUP_RANGE) {
      this.target = null;
      h.speedBoost = 1.35;
      this.moveToward(leader.x, leader.y);
      i.aim.copy(i.move);
      return i;
    }

    // 2. Dodge an enemy that is winding up an attack on me.
    if (h.dodgeCooldown <= 0) {
      for (const e of this.combat.opponentsOf(h) as Enemy[]) {
        // Dodge attacks aimed at me, plus tank slams and boss attacks (they hit an area).
        const threat = e.currentTarget === h || e.def.behavior === 'tank' || e.def.behavior === 'boss';
        if (e.stateName !== 'windup' || !threat) continue;
        const d = Phaser.Math.Distance.Between(h.x, h.y, e.x, e.y);
        // A small random chance each frame -> usually dodges, sometimes doesn't (feels human).
        if (d < 100 && Math.random() < 0.06) {
          i.move.set(h.x - e.x, h.y - e.y).normalize().rotate(Math.random() < 0.5 ? 0.6 : -0.6);
          i.dodge = true;
          return i;
        }
      }
    }

    // 3. Healer: heal when someone nearby is hurt.
    if (h.def.role === 'healer' && h.canUseSkill) {
      const hurt = this.combat
        .alliesOf(h)
        .find((a) => a.hp / a.maxHp < 0.55 && Phaser.Math.Distance.Between(h.x, h.y, a.x, a.y) < h.skillDef.radius - 20);
      if (hurt) {
        i.skill = true;
        return i;
      }
    }

    // 4. Pick a target a few times per second (not every frame: cheaper and less twitchy).
    this.retargetTimer -= dt;
    if (this.retargetTimer <= 0 || !this.target || this.target.dead) {
      this.retargetTimer = 0.3;
      this.target = this.pickTarget(leader);
    }
    if (this.target) {
      this.fight(this.target);
      return i;
    }

    // 5. Follow in formation: behind the leader, offset to my side.
    const perpX = -this.trail.y * this.side;
    const perpY = this.trail.x * this.side;
    const slotX = leader.x - this.trail.x * 38 + perpX * 30;
    const slotY = leader.y - this.trail.y * 38 + perpY * 30;
    const distSlot = Phaser.Math.Distance.Between(h.x, h.y, slotX, slotY);
    if (distSlot > 18) {
      if (distSlot > 110) h.speedBoost = 1.25; // catch up
      this.moveToward(slotX, slotY);
      i.aim.copy(i.move);
    }
    return i;
  }

  /** Move/attack/use skill against a target, depending on role. */
  private fight(t: Entity): void {
    const i = this.intent;
    const h = this.hero;
    const dist = Phaser.Math.Distance.Between(h.x, h.y, t.x, t.y);
    const pref = ROLE_RANGE[h.def.role];
    i.aim.set(t.x - h.x, t.y - h.y).normalize();

    if (dist > pref.max) this.moveToward(t.x, t.y);
    else if (dist < pref.min - 25) i.move.set(h.x - t.x, h.y - t.y).normalize(); // back off
    else i.attackHeld = true;

    // Ranged heroes also shoot while slightly out of their comfort zone.
    if (h.def.role !== 'melee' && dist < h.combo[0].range - 60) i.attackHeld = true;

    // Skills: melee spins when surrounded, ranged fires its piercing shot at a target in range.
    if (h.canUseSkill) {
      if (h.def.role === 'melee') {
        const near = this.combat.opponentsOf(h).filter((e) => Phaser.Math.Distance.Between(h.x, h.y, e.x, e.y) < 70);
        if (near.length >= 2) i.skill = true;
      } else if (h.def.role === 'ranged' && dist < 360) {
        i.skill = true;
      }
    }
  }

  private pickTarget(leader: Hero): Entity | null {
    let best: Entity | null = null;
    let bestDist = ENGAGE_RANGE;
    for (const e of this.combat.opponentsOf(this.hero)) {
      const d = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, e.x, e.y);
      const dLeader = Phaser.Math.Distance.Between(leader.x, leader.y, e.x, e.y);
      if (d < bestDist && dLeader < LEASH_RANGE) {
        best = e;
        bestDist = d;
      }
    }
    return best;
  }

  private moveToward(x: number, y: number): void {
    this.intent.move.set(x - this.hero.x, y - this.hero.y).normalize();
  }
}
