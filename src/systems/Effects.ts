import Phaser from 'phaser';
import { DEPTH } from '../config';

/**
 * Small visual effects ("juice"). None of these affect gameplay;
 * they just make hits and movement feel good. Each effect creates
 * short-lived objects and destroys them when its tween finishes.
 */

export type DamageStyle = 'normal' | 'big' | 'hurt' | 'heal' | 'effective' | 'effectiveBig' | 'resist' | 'chain';

const DAMAGE_COLORS: Record<DamageStyle, string> = {
  normal: '#ffffff',
  big: '#ffd23f',
  hurt: '#ff5a5a',
  heal: '#7dff8a',
  effective: '#ff9b3d', // element advantage
  effectiveBig: '#ff9b3d',
  resist: '#9a93a8', // element disadvantage
  chain: '#ff7af0',
};

/** Number that pops up above a target, rises, then fades. */
export function damageNumber(scene: Phaser.Scene, x: number, y: number, amount: number, style: DamageStyle): void {
  const big = style === 'big' || style === 'effectiveBig' || style === 'chain';
  const text = scene.add
    .text(x + Phaser.Math.Between(-8, 8), y, String(amount), {
      fontFamily: 'monospace',
      fontSize: big ? '24px' : '17px',
      fontStyle: 'bold',
      color: DAMAGE_COLORS[style],
      stroke: '#1a1422',
      strokeThickness: 4,
    })
    .setOrigin(0.5)
    .setDepth(DEPTH.effects)
    .setScale(big ? 1.8 : 1.4);

  // Pop in (scale down to 1), float up, then fade out.
  scene.tweens.add({ targets: text, scale: 1, duration: 140, ease: 'Back.easeOut' });
  scene.tweens.add({
    targets: text,
    y: y - (big ? 34 : 26),
    alpha: { from: 1, to: 0 },
    delay: 250,
    duration: 500,
    ease: 'Cubic.easeIn',
    onComplete: () => text.destroy(),
  });
}

/** A burst of tiny sparks where a hit lands. */
export function hitSpark(scene: Phaser.Scene, x: number, y: number, color = 0xffffff, count = 6): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Phaser.Math.Between(14, 28);
    const spark = scene.add.image(x, y, 'spark').setTint(color).setDepth(DEPTH.effects).setAngle(45);
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      scale: 0,
      duration: Phaser.Math.Between(180, 280),
      ease: 'Cubic.easeOut',
      onComplete: () => spark.destroy(),
    });
  }
}

/** Puff of smoke used when an enemy is defeated. */
export function poof(scene: Phaser.Scene, x: number, y: number, color: number): void {
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const puff = scene.add
      .image(x, y, 'dust')
      .setTint(i % 2 ? color : 0xffffff)
      .setDepth(DEPTH.effects)
      .setScale(1.4);
    scene.tweens.add({
      targets: puff,
      x: x + Math.cos(angle) * 30,
      y: y + Math.sin(angle) * 22 - 6,
      scale: 0,
      alpha: 0.2,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => puff.destroy(),
    });
  }
}

/** A sword-slash crescent in front of an attacker. */
export function slash(scene: Phaser.Scene, x: number, y: number, angle: number, scale: number, flipY: boolean, color: number): void {
  const s = scene.add
    .image(x, y, 'slash')
    .setRotation(angle)
    .setFlipY(flipY)
    .setTint(color)
    .setScale(scale * 0.7)
    .setDepth(DEPTH.effects - 1)
    .setAlpha(0.95);
  scene.tweens.add({
    targets: s,
    scale: scale,
    alpha: 0,
    duration: 200,
    ease: 'Cubic.easeOut',
    onComplete: () => s.destroy(),
  });
}

/** Expanding ring, used by area skills. */
export function ring(scene: Phaser.Scene, x: number, y: number, radius: number, color: number): void {
  const r = scene.add.image(x, y, 'ring').setTint(color).setDepth(DEPTH.effects - 1).setScale(0.2);
  const target = radius / 32; // ring texture is 64px wide = radius 32
  scene.tweens.add({
    targets: r,
    scale: target,
    alpha: { from: 1, to: 0 },
    duration: 320,
    ease: 'Cubic.easeOut',
    onComplete: () => r.destroy(),
  });
}

/** A fading copy of a sprite, left behind during a dodge roll. */
export function afterimage(scene: Phaser.Scene, source: Phaser.GameObjects.Image, worldX: number, worldY: number, depth: number): void {
  const ghost = scene.add
    .image(worldX, worldY, source.texture.key)
    .setFlipX(source.flipX)
    .setRotation(source.rotation)
    .setTintFill(0x9fd8ff)
    .setAlpha(0.5)
    .setDepth(depth - 1);
  scene.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
}

/**
 * Red danger zone on the floor ("telegraph"). An inner circle grows to fill the
 * outline; when it is full, the attack lands. Players learn to read this fast.
 * Returns the graphics object so the caller can remove it early if interrupted.
 */
export function warningZone(scene: Phaser.Scene, x: number, y: number, radius: number, seconds: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y }).setDepth(DEPTH.shadows);
  const state = { p: 0 };
  const draw = () => {
    if (!g.active) return;
    g.clear();
    g.fillStyle(0xff3030, 0.18).fillEllipse(0, 0, radius * 2, radius * 1.4);
    g.lineStyle(2, 0xff4a4a, 0.9).strokeEllipse(0, 0, radius * 2, radius * 1.4);
    g.fillStyle(0xff3030, 0.35).fillEllipse(0, 0, radius * 2 * state.p, radius * 1.4 * state.p);
  };
  draw();
  scene.tweens.add({
    targets: state,
    p: 1,
    duration: seconds * 1000,
    onUpdate: draw,
    onComplete: () => g.destroy(),
  });
  return g;
}

/** Floating text like "!" or "Room Cleared". */
export function popText(scene: Phaser.Scene, x: number, y: number, text: string, color = '#ffd23f', size = 20): void {
  const t = scene.add
    .text(x, y, text, {
      fontFamily: 'monospace',
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: '#1a1422',
      strokeThickness: 4,
    })
    .setOrigin(0.5)
    .setDepth(DEPTH.effects)
    .setScale(0.3);
  scene.tweens.chain({
    targets: t,
    tweens: [
      { scale: 1, y: y - 10, duration: 180, ease: 'Back.easeOut' },
      { alpha: 0, delay: 350, duration: 250 },
    ],
    onComplete: () => t.destroy(),
  });
}
