import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';

interface Flake {
  img: Phaser.GameObjects.Image;
  speed: number;
  sway: number;
  phase: number;
}

/**
 * SNOWFALL: little white flakes drifting down over the screen.
 *
 * The flakes ignore the camera (scrollFactor 0) so they cover the screen no
 * matter where you walk. Each frame every flake falls, sways side to side with
 * a sine wave, and wraps back to the top when it leaves the bottom.
 * Pure decoration: no physics, no collisions.
 */
export class Snowfall {
  private flakes: Flake[] = [];
  private time = 0;

  constructor(scene: Phaser.Scene, count = 70) {
    for (let i = 0; i < count; i++) {
      const near = Math.random() < 0.3; // a few big, fast "near" flakes for depth
      const img = scene.add
        .image(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT), 'snowflake')
        .setScrollFactor(0)
        .setDepth(DEPTH.effects - 10)
        .setScale(near ? Phaser.Math.FloatBetween(1, 1.5) : Phaser.Math.FloatBetween(0.4, 0.8))
        .setAlpha(near ? 0.85 : 0.5);
      this.flakes.push({ img, speed: near ? Phaser.Math.Between(45, 70) : Phaser.Math.Between(18, 35), sway: Phaser.Math.Between(8, 22), phase: Math.random() * 10 });
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (const f of this.flakes) {
      f.img.y += f.speed * dt;
      f.img.x += Math.cos(this.time * 1.3 + f.phase) * f.sway * dt + 6 * dt; // gentle wind to the right
      if (f.img.y > GAME_HEIGHT + 6) {
        f.img.y = -6;
        f.img.x = Phaser.Math.Between(0, GAME_WIDTH);
      }
      if (f.img.x > GAME_WIDTH + 6) f.img.x = -6;
    }
  }
}
