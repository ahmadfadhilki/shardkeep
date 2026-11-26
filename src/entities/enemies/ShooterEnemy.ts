import Phaser from 'phaser';
import { Enemy } from '../Enemy';
import type { Entity } from '../Entity';
import { DEPTH } from '../../config';

/**
 * Ember Wisp: a floating flame that keeps its distance.
 *  - Too close?  It backs away.
 *  - Too far?    It drifts closer.
 *  - In range?   It strafes sideways, then telegraphs (glow + aim line) and
 *                fires a spread of fireballs.
 * Ranged heroes are great against it; melee heroes have to chase it down.
 */
export class ShooterEnemy extends Enemy {
  private aimLine?: Phaser.GameObjects.Graphics;
  private strafeDir = 1;
  private strafeTimer = 0;

  protected idleAnimation(): void {
    // Hover up and down instead of wobbling.
    const t = this.scene.time.now * 0.004 + this.home.x;
    this.visual.y = this.visualBaseY - 8 + Math.sin(t) * 3;
    this.visual.setScale(1, 1 + Math.sin(t * 2) * 0.04);
  }

  protected chaseUpdate(dt: number, target: Entity, dist: number): void {
    this.idleAnimation();
    const tooClose = 140;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.hypot(dx, dy) || 1;

    if (dist > this.def.attackRange) {
      this.steer((dx / len) * this.def.speed, (dy / len) * this.def.speed, dt);
    } else if (dist < tooClose) {
      this.steer((-dx / len) * this.def.speed, (-dy / len) * this.def.speed, dt);
    } else {
      // In the sweet spot: strafe sideways (perpendicular to the target)...
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = Phaser.Math.FloatBetween(0.8, 1.6);
        this.strafeDir *= -1;
      }
      const s = this.def.speed * 0.6 * this.strafeDir;
      this.steer((-dy / len) * s, (dx / len) * s, dt);
      // ...and attack once we've had a moment to settle.
      if (this.fsm.time > 0.5) this.startWindup();
    }
  }

  protected onWindupStart(): void {
    this.aimLine = this.scene.add.graphics().setDepth(DEPTH.shadows);
  }

  protected onWindupUpdate(progress: number): void {
    this.idleAnimation();
    // Keep tracking the target for most of the wind-up, then lock the aim.
    const t = this.target;
    if (t && progress < 0.7) this.attackDir.set(t.x - this.x, t.y - this.y).normalize();

    // Glow brighter as it charges.
    const flicker = Math.floor(progress * 20) % 2 === 0;
    this.visual.setTint(flicker ? 0xffffff : 0xffd27a);
    this.visual.setScale(1 + progress * 0.25);

    // Faint aim line: tells the player where the shots will go.
    const g = this.aimLine!;
    g.clear();
    g.lineStyle(2, 0xff6b3a, 0.15 + progress * 0.35);
    g.lineBetween(this.x, this.y, this.x + this.attackDir.x * 220, this.y + this.attackDir.y * 220);
  }

  protected onWindupEnd(): void {
    this.aimLine?.destroy();
    this.aimLine = undefined;
  }

  protected onAttackStart(): void {
    const count = this.def.shotCount ?? 1;
    const spread = Phaser.Math.DegToRad(this.def.shotSpread ?? 0);
    const base = this.attackDir.angle() - (spread * (count - 1)) / 2;
    for (let i = 0; i < count; i++) {
      this.combat.shoot(this, base + spread * i, this.def.shotSpeed ?? 220, 420, 'bolt', this.def.color, {
        power: this.def.attackPower,
        knockback: 160,
      });
    }
    // Recoil "puff".
    this.visual.setScale(1.3, 0.8);
  }

  protected onAttackUpdate(_dt: number, time: number): boolean {
    this.visual.setScale(
      Phaser.Math.Linear(this.visual.scaleX, 1, 0.2),
      Phaser.Math.Linear(this.visual.scaleY, 1, 0.2),
    );
    return time > 0.2;
  }
}
