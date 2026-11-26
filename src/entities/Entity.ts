import Phaser from 'phaser';
import { DEPTH } from '../config';
import type { Element } from '../data/heroes';
import type { Status } from '../data/skills';

/** Which side an entity fights for. Attacks only hit the other team. */
export type Team = 'hero' | 'enemy';

/** Basic combat stats every entity has. */
export interface CombatStats {
  hp: number;
  atk: number;
  def: number;
}

/** Information about one hit, passed to takeDamage(). */
export interface Hit {
  attacker: Entity;
  /** Final damage after the formula (see CombatSystem.computeDamage). */
  damage: number;
  /** Unit vector pointing from attacker to target. */
  dirX: number;
  dirY: number;
  /** Heavy hits (combo finisher, skills) knock back further and stun longer. */
  heavy: boolean;
}

/**
 * Entity: the base class for anything that moves and fights:
 * heroes, enemies, and (later) the boss.
 *
 * It is a Phaser Container holding:
 *   - shadow  : ellipse on the ground
 *   - visual  : the character sprite (we can bob/squash/spin it freely)
 *
 * Why a Container? The physics body stays a fixed size at the "feet", while
 * the visual can bounce, flip, and squash without changing collisions.
 *
 * Shared combat features live here so Hero and Enemy get them for free:
 * HP, invincibility frames, knockback/stagger, and the white hit flash.
 */
export class Entity extends Phaser.GameObjects.Container {
  /** Arcade physics body (declared so TypeScript knows it is an Arcade body). */
  declare body: Phaser.Physics.Arcade.Body;

  protected shadow: Phaser.GameObjects.Image;
  protected visual: Phaser.GameObjects.Image;
  /** Resting y of the visual (it is centered, so it sits above the feet). */
  protected visualBaseY: number;

  readonly team: Team;
  maxHp: number;
  hp: number;
  atk: number;
  defense: number;
  /** Rough body radius for hit detection (px). */
  radius: number;
  dead = false;
  /** Fire / Water / Earth. Decides bonus damage (see elementMultiplier in CombatSystem). */
  element: Element | null = null;
  /** 0 = full knockback, 1 = immovable. Tanks and bosses resist being pushed. */
  knockbackResist = 0;

  /** While > 0, incoming hits are ignored ("i-frames"). Seconds. */
  invulnTimer = 0;
  /** While > 0, the entity is being knocked back and cannot act. Seconds. */
  staggerTimer = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    team: Team,
    stats: CombatStats,
    radius = 12,
  ) {
    super(scene, x, y);
    this.team = team;
    this.maxHp = this.hp = stats.hp;
    this.atk = stats.atk;
    this.defense = stats.def;
    this.radius = radius;

    this.shadow = scene.add.image(0, 0, 'shadow');
    this.visual = scene.add.image(0, 0, texture);
    // Centered origin makes spins/rolls rotate around the middle of the body.
    this.visualBaseY = 3 - this.visual.height / 2;
    this.visual.y = this.visualBaseY;
    this.add([this.shadow, this.visual]);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // The physics body is a small box at the feet. A container's body starts
    // at its (x, y), so offset by half the size to center it.
    const bw = radius * 1.5;
    const bh = radius;
    this.body.setSize(bw, bh, false);
    this.body.setOffset(-bw / 2, -bh / 2);
  }

  get isStaggered(): boolean {
    return this.staggerTimer > 0;
  }

  /**
   * Update shared timers. Subclasses call this at the start of their tick().
   * While staggered, velocity slowly bleeds off like friction.
   */
  protected tickBase(dt: number): void {
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.staggerTimer > 0) {
      this.staggerTimer -= dt;
      const friction = Math.exp(-7 * dt);
      this.body.velocity.scale(friction);
    }
  }

  /** Briefly paint the sprite a solid color (the classic "I got hit" flash). */
  flash(color = 0xffffff, ms = 90): void {
    this.visual.setTintFill(color);
    this.scene.time.delayedCall(ms, () => {
      if (this.active && !this.dead) this.visual.clearTint();
    });
  }

  /** Push the entity away and stop it from acting for `stagger` seconds. */
  knockback(dirX: number, dirY: number, force: number, stagger: number): void {
    const f = force * (1 - this.knockbackResist);
    this.body.setVelocity(dirX * f, dirY * f);
    this.staggerTimer = Math.max(this.staggerTimer, stagger);
  }

  /** Lose HP. Calls onHurt() or onDeath() so subclasses can react. */
  takeDamage(hit: Hit): void {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - hit.damage);
    if (this.hp === 0) {
      this.dead = true;
      this.onDeath(hit);
    } else {
      this.onHurt(hit);
    }
  }

  /**
   * Put the entity into a status like stunned or knocked down.
   * Does nothing by default; Enemy overrides it (heroes can't be stunned).
   */
  applyStatus(_status: Status, _duration: number, _force = false): void {}
  /** Called when one of this entity's attacks hits something. Heroes gain mana. */
  onDealtHit(): void {}
  /** End any status early (used by chain finishers). No-op by default. */
  clearStatus(): void {}

  /** Override in subclasses: called when hit but still alive. */
  protected onHurt(_hit: Hit): void {}
  /** Override in subclasses: called once when HP reaches 0. */
  protected onDeath(_hit: Hit): void {}

  /**
   * Keep draw order correct: things lower on screen are drawn in front.
   * Call this every frame after moving.
   */
  protected updateDepth(): void {
    this.setDepth(DEPTH.entities + this.y);
  }
}
