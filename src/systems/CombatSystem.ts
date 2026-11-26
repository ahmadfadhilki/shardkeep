import Phaser from 'phaser';
import { Sfx } from './Sfx';
import type { Entity } from '../entities/Entity';
import { Projectile } from '../entities/Projectile';
import { damageNumber, hitSpark, type DamageStyle } from './Effects';
import type { Element } from '../data/heroes';
import { STATUS_DURATION, type Status } from '../data/skills';

/** Options describing one attack. */
export interface AttackOptions {
  /** Damage multiplier on the attacker's ATK (1 = normal hit). */
  power: number;
  /** Knockback speed in px/s. */
  knockback: number;
  /** Heavy hits stagger longer, pop a bigger number and freeze the game a bit longer. */
  heavy?: boolean;
  /** Where the hit comes from (for knockback direction). Defaults to the attacker. */
  from?: { x: number; y: number };
  /**
   * Screen shake + hit-stop. Only the player's own hits should do this,
   * otherwise AI companions would make the screen stutter non-stop.
   */
  juice?: boolean;
  /** Status to apply to the target if it survives (starts chain opportunities). */
  inflict?: Status;
  /** Chain-skill hit: shown with a big pink number. */
  chain?: boolean;
}

/**
 * Anything (not an enemy) that hero attacks can hit: crystals, bushes,
 * cracked walls. Props implement this so CombatSystem can tell them "you got hit".
 */
export interface Hittable {
  x: number;
  y: number;
  hitRadius: number;
  active: boolean;
  onHit(heavy: boolean): void;
}

/**
 * ELEMENT WHEEL: Fire > Earth > Water > Fire
 * Each element beats the one it points to.
 */
const BEATS: Record<Element, Element> = { fire: 'earth', earth: 'water', water: 'fire' };
export const ELEMENT_ADVANTAGE = 1.3;
export const ELEMENT_DISADVANTAGE = 0.75;

/** Damage multiplier for an attacker's element against a defender's element. */
export function elementMultiplier(attacker: Element | null, defender: Element | null): number {
  if (!attacker || !defender) return 1;
  if (BEATS[attacker] === defender) return ELEMENT_ADVANTAGE;
  if (BEATS[defender] === attacker) return ELEMENT_DISADVANTAGE;
  return 1;
}

/**
 * CombatSystem: the referee.
 * It knows every hero, enemy and projectile, finds who an attack touches,
 * calculates damage, and triggers the hit effects.
 *
 * Hit detection here is simple geometry (distance + angle checks) instead of
 * physics overlaps. It is easy to understand and plenty for a small game.
 */
export class CombatSystem {
  heroes: Entity[] = [];
  enemies: Entity[] = [];
  projectiles: Projectile[] = [];
  /** Props that hero attacks can hit (crystals, bushes...). Set by RoomController. */
  hittables: Hittable[] = [];
  /** Returns true if a projectile at (x, y) should stop (walls, doors, blocks). Set by StageScene. */
  solidAt: (x: number, y: number) => boolean = () => false;
  /** Returns true for the hero the player controls (used for screen-shake rules). */
  isPlayer: (e: Entity) => boolean = () => false;

  /**
   * "Hit-stop": freeze the action for a few milliseconds when a hit lands.
   * It is a tiny pause but makes hits feel MUCH heavier. StageScene reads this.
   */
  freezeTime = 0;

  constructor(private scene: Phaser.Scene) {}

  /** Living entities on the other team. */
  opponentsOf(e: Entity): Entity[] {
    const list = e.team === 'hero' ? this.enemies : this.heroes;
    return list.filter((t) => !t.dead);
  }

  /** Living entities on the same team (including itself). */
  alliesOf(e: Entity): Entity[] {
    const list = e.team === 'hero' ? this.heroes : this.enemies;
    return list.filter((t) => !t.dead);
  }

  /**
   * Hit every opponent inside a cone ("arc") in front of the attacker.
   * @param angle direction the attacker faces (radians)
   * @param range reach in pixels
   * @param arcDeg width of the cone in degrees
   * @returns how many targets were hit
   */
  arcAttack(attacker: Entity, angle: number, range: number, arcDeg: number, opts: AttackOptions): number {
    let hits = 0;
    for (const target of this.opponentsOf(attacker)) {
      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const dist = Math.hypot(dx, dy);
      if (dist > range + target.radius) continue;

      // Angle between "where I'm facing" and "where the target is".
      const diff = Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - angle);
      const touching = dist < attacker.radius + target.radius; // point-blank always hits
      if (Math.abs(diff) > Phaser.Math.DegToRad(arcDeg / 2) && !touching) continue;

      if (this.applyHit(attacker, target, opts)) hits++;
    }

    // Heroes' swings also hit props (same cone check).
    if (attacker.team === 'hero') {
      for (const prop of this.hittables) {
        if (!prop.active) continue;
        const dx = prop.x - attacker.x;
        const dy = prop.y - attacker.y;
        const dist = Math.hypot(dx, dy);
        if (dist > range + prop.hitRadius) continue;
        const diff = Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - angle);
        if (Math.abs(diff) > Phaser.Math.DegToRad(arcDeg / 2) && dist > prop.hitRadius + attacker.radius) continue;
        prop.onHit(!!opts.heavy);
      }
    }
    return hits;
  }

  /** Hit every opponent (and, for heroes, every prop) within `radius` of a point. */
  circleAttack(attacker: Entity, x: number, y: number, radius: number, opts: AttackOptions): number {
    let hits = 0;
    for (const target of this.opponentsOf(attacker)) {
      if (Phaser.Math.Distance.Between(x, y, target.x, target.y) > radius + target.radius) continue;
      if (this.applyHit(attacker, target, opts)) hits++;
    }
    if (attacker.team === 'hero') {
      for (const prop of this.hittables) {
        if (prop.active && Phaser.Math.Distance.Between(x, y, prop.x, prop.y) <= radius + prop.hitRadius) {
          prop.onHit(!!opts.heavy);
        }
      }
    }
    return hits;
  }

  /** Fire a projectile. It is updated by update() until it hits something or flies out of range. */
  shoot(
    owner: Entity,
    angle: number,
    speed: number,
    range: number,
    texture: string,
    tint: number,
    opts: AttackOptions,
    pierce = false,
  ): void {
    const startX = owner.x + Math.cos(angle) * 14;
    const startY = owner.y + Math.sin(angle) * 10;
    this.projectiles.push(new Projectile(this.scene, owner, startX, startY, angle, speed, range, texture, tint, opts, pierce));
  }

  /** Move all projectiles. Called once per frame by StageScene. */
  update(dt: number): void {
    this.projectiles = this.projectiles.filter((p) => {
      const alive = p.tick(dt, this);
      if (!alive) p.destroy();
      return alive;
    });
  }

  /** Apply one hit to one target. Returns false if the hit was ignored (i-frames, already dead). */
  applyHit(attacker: Entity, target: Entity, opts: AttackOptions): boolean {
    if (target.dead || target.invulnTimer > 0) return false;

    const from = opts.from ?? attacker;
    const dir = new Phaser.Math.Vector2(target.x - from.x, target.y - from.y);
    if (dir.lengthSq() === 0) dir.set(1, 0);
    dir.normalize();

    const heavy = !!opts.heavy;
    const elemMult = elementMultiplier(attacker.element, target.element);
    const damage = computeDamage(attacker.atk, target.defense, opts.power * elemMult);

    target.knockback(dir.x, dir.y, opts.knockback, heavy ? 0.4 : 0.22);
    target.takeDamage({ attacker, damage, dirX: dir.x, dirY: dir.y, heavy });
    attacker.onDealtHit();
    if (opts.inflict && !target.dead) target.applyStatus(opts.inflict, STATUS_DURATION[opts.inflict]);
    // Flash AFTER takeDamage: a state change inside takeDamage may clear tints.
    target.flash();

    // Effects. The number's color tells you about elements:
    // orange = super effective, grey = resisted.
    const isHeroHurt = target.team === 'hero';
    let style: DamageStyle = isHeroHurt ? 'hurt' : heavy ? 'big' : 'normal';
    if (!isHeroHurt && elemMult > 1) style = heavy ? 'effectiveBig' : 'effective';
    if (!isHeroHurt && elemMult < 1) style = 'resist';
    if (opts.chain) style = 'chain';
    damageNumber(this.scene, target.x, target.y - 34, damage, style);
    hitSpark(this.scene, target.x, target.y - 12, heavy ? 0xffd23f : 0xffffff, heavy ? 10 : 6);
    Sfx.play(opts.chain ? 'chain' : isHeroHurt ? 'hurt' : heavy ? 'hitHeavy' : 'hit');

    const cam = this.scene.cameras.main;
    if (isHeroHurt && this.isPlayer(target)) {
      cam.shake(140, 0.006);
      this.freeze(0.06);
    } else if (opts.juice) {
      cam.shake(heavy ? 120 : 60, heavy ? 0.006 : 0.0025);
      this.freeze(heavy ? 0.09 : 0.045);
    }
    return true;
  }

  /** Restore HP and show a green number. */
  heal(target: Entity, amount: number): void {
    if (target.dead) return;
    const healed = Math.min(amount, target.maxHp - target.hp);
    target.hp += healed;
    if (healed > 0) Sfx.play('heal');
    damageNumber(this.scene, target.x, target.y - 34, healed, 'heal');
    hitSpark(this.scene, target.x, target.y - 12, 0x7dff8a, 8);
  }

  /** Request a hit-stop (keeps the longest one if several happen at once). */
  freeze(seconds: number): void {
    this.freezeTime = Math.max(this.freezeTime, seconds);
  }
}

/**
 * The damage formula. Kept in one small function so it is easy to tweak.
 *   damage = ATK x power - DEF / 2, with +/-10% randomness, minimum 1.
 * (`power` already includes the element multiplier.)
 */
export function computeDamage(atk: number, def: number, power: number): number {
  const base = atk * power - def * 0.5;
  return Math.max(1, Math.round(base * Phaser.Math.FloatBetween(0.9, 1.1)));
}
