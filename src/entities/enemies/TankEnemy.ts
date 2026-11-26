import Phaser from 'phaser';
import { Enemy } from '../Enemy';
import type { Entity } from '../Entity';
import { ring, warningZone } from '../../systems/Effects';

/**
 * Tide Shell: slow, tough and armored.
 *  - Normal hits don't interrupt it (it has "poise"). Heavy hits and skills
 *    wear the armor down; when it BREAKS, the shell is stunned -> chain time!
 *  - Its attack is a ground slam. A red zone shows where it will land:
 *    step out of the red before the inner circle fills up.
 */
export class TankEnemy extends Enemy {
  private zone?: Phaser.GameObjects.Graphics;

  protected chaseUpdate(dt: number, target: Entity, dist: number): void {
    if (dist < this.def.attackRange) {
      this.startWindup();
      return;
    }
    // Heavy, stompy walk: speed pulses with each step.
    const step = Math.abs(Math.sin(this.scene.time.now * 0.008));
    this.moveToward(target.x, target.y, this.def.speed * (0.5 + step), dt);
    this.visual.setAngle(Math.sin(this.scene.time.now * 0.008) * 4);
  }

  protected onWindupStart(): void {
    this.zone = warningZone(this.scene, this.x, this.y, this.def.slamRadius ?? 80, this.def.windup);
  }

  protected onWindupUpdate(progress: number): void {
    // Rise up, ready to crash down.
    this.visual.y = this.visualBaseY - progress * 14;
    this.visual.setScale(1 - progress * 0.1, 1 + progress * 0.15);
    if (progress > 0.75 && Math.floor(progress * 30) % 2 === 0) this.visual.setTint(0xff8a8a);
    else this.visual.clearTint();
  }

  protected onWindupEnd(): void {
    // If we were interrupted (e.g. armor broke) before the wind-up finished,
    // remove the warning early. (Otherwise it fades by itself as the slam lands.)
    if (this.fsm.time < this.def.windup) this.zone?.destroy();
    this.zone = undefined;
  }

  protected onAttackStart(): void {
    const r = this.def.slamRadius ?? 80;
    this.visual.setPosition(0, this.visualBaseY).setScale(1.3, 0.75);
    ring(this.scene, this.x, this.y, r, this.def.accent);
    this.scene.cameras.main.shake(160, 0.007);
    this.combat.circleAttack(this, this.x, this.y, r, { power: this.def.attackPower, knockback: 340, heavy: true });
  }

  protected onAttackUpdate(_dt: number, time: number): boolean {
    this.visual.setScale(
      Phaser.Math.Linear(this.visual.scaleX, 1, 0.15),
      Phaser.Math.Linear(this.visual.scaleY, 1, 0.15),
    );
    return time > 0.3;
  }
}
