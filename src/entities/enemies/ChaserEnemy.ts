import Phaser from 'phaser';
import { Enemy } from '../Enemy';
import type { Entity } from '../Entity';

/**
 * Bramble Slime: runs at you, squashes down while flashing red (telegraph),
 * then LUNGES. Normal hits interrupt it, so a quick combo can cancel its attack.
 */
export class ChaserEnemy extends Enemy {
  private landed = false;

  protected chaseUpdate(dt: number, target: Entity, dist: number): void {
    if (dist < this.def.attackRange) {
      this.startWindup();
      return;
    }
    this.moveToward(target.x, target.y, this.def.speed, dt);
    // Hop while moving.
    const hop = Math.abs(Math.sin(this.scene.time.now * 0.01));
    this.visual.y = this.visualBaseY - hop * 4;
    this.visual.setScale(1 - hop * 0.08, 1 + hop * 0.08);
  }

  protected onWindupUpdate(progress: number): void {
    // Pulse red and squash down like a spring.
    const pulse = Math.floor(progress * this.def.windup * 14) % 2 === 0;
    if (pulse) this.visual.setTint(0xff6b6b);
    else this.visual.clearTint();
    this.visual.setScale(1 + progress * 0.25, 1 - progress * 0.25);
    this.visual.x = Math.sin(this.scene.time.now * 0.06) * 1.5; // shiver
  }

  protected onAttackStart(): void {
    this.landed = false;
    const speed = this.def.lungeSpeed ?? 300;
    this.body.setVelocity(this.attackDir.x * speed, this.attackDir.y * speed);
    this.visual.setScale(0.8, 1.25); // stretch while leaping
  }

  protected onAttackUpdate(dt: number, time: number): boolean {
    this.visual.y = this.visualBaseY - Math.sin((time / 0.25) * Math.PI) * 10;
    // Check every frame of the lunge whether we touch a hero.
    if (!this.landed) {
      for (const hero of this.combat.opponentsOf(this)) {
        const d = Phaser.Math.Distance.Between(this.x, this.y, hero.x, hero.y);
        if (d < this.radius + hero.radius + 4) {
          this.landed = this.combat.applyHit(this, hero, { power: this.def.attackPower, knockback: 260 });
          if (this.landed) break;
        }
      }
    }
    this.body.velocity.scale(Math.exp(-3 * dt));
    return time >= 0.25;
  }
}
