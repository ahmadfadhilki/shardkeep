import Phaser from 'phaser';
import { DEPTH } from '../config';
import type { Entity } from './Entity';
import type { AttackOptions, CombatSystem, Hittable } from '../systems/CombatSystem';
import { hitSpark } from '../systems/Effects';

/** How high above the ground projectiles fly (purely visual). */
const FLY_HEIGHT = 14;

/**
 * A flying shot (arrow, magic bolt, enemy bullet...).
 *
 * It does NOT use the physics engine. Each frame we move it by velocity * dt,
 * check if it entered a wall tile, and check distance to every opponent.
 * Doing it by hand is simple and teaches what physics engines do for you.
 *
 * Its logical position (x, y) is on the ground, like entities' feet,
 * while the sprite is drawn FLY_HEIGHT pixels higher with a shadow below.
 */
export class Projectile extends Phaser.GameObjects.Container {
  private vx: number;
  private vy: number;
  private distanceLeft: number;
  private readonly owner: Entity;
  private readonly opts: AttackOptions;
  private readonly pierce: boolean;
  private readonly radius: number;
  /** Entities already hit (so piercing shots hit each target only once). */
  private readonly alreadyHit = new Set<Entity | Hittable>();
  private readonly tint: number;

  constructor(
    scene: Phaser.Scene,
    owner: Entity,
    x: number,
    y: number,
    angle: number,
    speed: number,
    range: number,
    texture: string,
    tint: number,
    opts: AttackOptions,
    pierce = false,
    radius = 6,
  ) {
    super(scene, x, y);
    this.owner = owner;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.distanceLeft = range;
    this.opts = opts;
    this.pierce = pierce;
    this.radius = radius;
    this.tint = tint;

    const shadow = scene.add.image(0, 0, 'shadow').setScale(0.4).setAlpha(0.6);
    const sprite = scene.add.image(0, -FLY_HEIGHT, texture).setRotation(angle).setTint(tint);
    this.add([shadow, sprite]);
    scene.add.existing(this);
  }

  /** Move, collide, and hit. Returns false when the projectile is finished. */
  tick(dt: number, combat: CombatSystem): boolean {
    const stepX = this.vx * dt;
    const stepY = this.vy * dt;
    this.x += stepX;
    this.y += stepY;
    this.distanceLeft -= Math.hypot(stepX, stepY);
    this.setDepth(DEPTH.entities + this.y);

    // Hero shots can hit props (crystals, bushes, cracked walls).
    if (this.owner.team === 'hero') {
      for (const prop of combat.hittables) {
        if (!prop.active || this.alreadyHit.has(prop)) continue;
        if (Phaser.Math.Distance.Between(this.x, this.y, prop.x, prop.y) > this.radius + prop.hitRadius) continue;
        this.alreadyHit.add(prop);
        prop.onHit(!!this.opts.heavy);
        if (!this.pierce) return false;
      }
    }

    // Hit a wall, door or block?
    if (combat.solidAt(this.x, this.y)) {
      hitSpark(this.scene, this.x, this.y - FLY_HEIGHT, this.tint, 4);
      return false;
    }

    for (const target of combat.opponentsOf(this.owner)) {
      if (this.alreadyHit.has(target)) continue;
      if (Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) > this.radius + target.radius) continue;
      this.alreadyHit.add(target);
      // Knock the target in the direction the projectile travels.
      combat.applyHit(this.owner, target, { ...this.opts, from: { x: this.x - this.vx, y: this.y - this.vy } });
      if (!this.pierce) return false;
    }

    return this.distanceLeft > 0;
  }
}
