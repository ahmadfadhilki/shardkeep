import Phaser from 'phaser';
import { DEPTH, TILE } from '../config';
import type { Hittable } from '../systems/CombatSystem';
import { hitSpark, poof, popText, ring } from '../systems/Effects';

/**
 * PROPS: the puzzle pieces and objects that live in rooms.
 * Each is a small class so it's easy to read on its own.
 *
 * Solid props (doors, blocks, cracked walls) get a STATIC physics body from
 * the room's "solids" group, so heroes and enemies bump into them.
 */

/** Draw order: things lower on screen go in front, like entities. */
function depthAt(y: number): number {
  return DEPTH.entities + y;
}

// ---------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------

/** A barred door ('D' opens when the room's lock is solved, 'L' needs a key). */
export class Door extends Phaser.GameObjects.Image {
  readonly locked: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, locked: boolean) {
    super(scene, x, y, locked ? 'lockDoor' : 'door');
    this.locked = locked;
    this.setDepth(depthAt(y + 14));
    scene.add.existing(this);
  }

  /** Slide the bars into the floor, then remove the door. */
  open(): void {
    if (!this.active) return;
    // Turn off collisions right away; the sprite then animates away.
    const body = this.body as Phaser.Physics.Arcade.StaticBody | null;
    if (body) body.enable = false;
    hitSpark(this.scene, this.x, this.y, 0xffd23f, 6);
    this.scene.tweens.add({
      targets: this,
      scaleY: 0,
      y: this.y + TILE / 2,
      alpha: 0.3,
      duration: 350,
      ease: 'Cubic.easeIn',
      onComplete: () => this.destroy(),
    });
  }
}

// ---------------------------------------------------------------------------
// Cracked wall (secret!)
// ---------------------------------------------------------------------------

/** Looks almost like a normal wall, but crumbles when hit. Hides secrets. */
export class CrackedWall extends Phaser.GameObjects.Image implements Hittable {
  hitRadius = 18;
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly onBreak: () => void,
  ) {
    super(scene, x, y, 'crackedWall');
    this.setDepth(depthAt(y + 14));
    scene.add.existing(this);
  }

  onHit(): void {
    if (!this.active) return;
    poof(this.scene, this.x, this.y, 0x7a6896);
    this.scene.cameras.main.shake(80, 0.004);
    popText(this.scene, this.x, this.y - 24, 'Secret!', '#ffd23f', 16);
    this.onBreak();
    this.destroy();
  }
}

// ---------------------------------------------------------------------------
// Push block + pressure switch
// ---------------------------------------------------------------------------

/** A heavy block that slides exactly one tile when pushed. */
export class PushBlock extends Phaser.GameObjects.Image {
  tx: number;
  ty: number;
  moving = false;

  constructor(scene: Phaser.Scene, tx: number, ty: number) {
    super(scene, tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'block');
    this.tx = tx;
    this.ty = ty;
    this.setDepth(depthAt(this.y + 14));
    scene.add.existing(this);
  }

  /**
   * Try to slide one tile in (dx, dy). `canEnter` decides if the target tile is free.
   * Returns true if the block moved.
   */
  push(dx: number, dy: number, canEnter: (tx: number, ty: number) => boolean, onDone: () => void): boolean {
    if (this.moving) return false;
    const nx = this.tx + dx;
    const ny = this.ty + dy;
    if (!canEnter(nx, ny)) {
      // Little shake = "it won't budge".
      this.scene.tweens.add({ targets: this, x: this.x + dx * 2, y: this.y + dy * 2, duration: 40, yoyo: true });
      return false;
    }
    this.moving = true;
    this.tx = nx;
    this.ty = ny;
    const body = this.body as Phaser.Physics.Arcade.StaticBody;
    this.scene.tweens.add({
      targets: this,
      x: nx * TILE + TILE / 2,
      y: ny * TILE + TILE / 2,
      duration: 180,
      ease: 'Quad.easeOut',
      // Static bodies don't follow their sprite automatically: sync each frame.
      onUpdate: () => body.updateFromGameObject(),
      onComplete: () => {
        body.updateFromGameObject();
        this.moving = false;
        this.setDepth(depthAt(this.y + 14));
        onDone();
      },
    });
    return true;
  }
}

/** A floor switch. It is pressed while a block sits on it. */
export class PressurePlate extends Phaser.GameObjects.Image {
  readonly tx: number;
  readonly ty: number;
  pressed = false;

  constructor(scene: Phaser.Scene, tx: number, ty: number) {
    super(scene, tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'plate');
    this.tx = tx;
    this.ty = ty;
    this.setDepth(DEPTH.shadows - 1);
    scene.add.existing(this);
  }

  setPressed(pressed: boolean): void {
    if (pressed === this.pressed) return;
    this.pressed = pressed;
    this.setTexture(pressed ? 'platePressed' : 'plate');
    if (pressed) ring(this.scene, this.x, this.y, 24, 0x7dff8a);
  }
}

// ---------------------------------------------------------------------------
// Crystals
// ---------------------------------------------------------------------------

export const CRYSTAL_COLORS: Record<number, number> = { 1: 0xff5a5a, 2: 0x5ab0ff, 3: 0x6ee06a, 4: 0xffd23f };

/** A crystal that lights up when hit. The RoomController checks the order. */
export class Crystal extends Phaser.GameObjects.Image implements Hittable {
  readonly id: number;
  readonly color: number;
  hitRadius = 16;
  lit = false;
  private cooldown = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    id: number,
    private readonly onStruck: (crystal: Crystal) => void,
  ) {
    super(scene, x, y - 10, 'crystal');
    this.id = id;
    this.color = CRYSTAL_COLORS[id] ?? 0xffffff;
    this.setDepth(depthAt(y)).setTint(this.dimColor());
    scene.add.existing(this);
    // Gentle float.
    scene.tweens.add({ targets: this, y: this.y - 4, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  onHit(): void {
    if (this.cooldown > this.scene.time.now) return; // ignore rapid multi-hits
    this.cooldown = this.scene.time.now + 250;
    this.onStruck(this);
  }

  setLit(lit: boolean): void {
    this.lit = lit;
    this.setTint(lit ? this.color : this.dimColor());
    if (lit) {
      ring(this.scene, this.x, this.y, 26, this.color);
      hitSpark(this.scene, this.x, this.y, this.color, 8);
    }
  }

  /** Red flash when the order was wrong. */
  buzz(): void {
    this.setTintFill(0xff3030);
    this.scene.time.delayedCall(180, () => this.active && this.setTint(this.dimColor()));
  }

  private dimColor(): number {
    const c = Phaser.Display.Color.IntegerToColor(this.color);
    return Phaser.Display.Color.GetColor(c.red * 0.45, c.green * 0.45, c.blue * 0.45);
  }
}

// ---------------------------------------------------------------------------
// Bushes & pickups
// ---------------------------------------------------------------------------

export type BushContent = 'none' | 'coin' | 'key' | 'star';

/** A bush you can cut. It may hide a coin, the key, or a star. */
export class Bush extends Phaser.GameObjects.Image implements Hittable {
  hitRadius = 14;
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly content: BushContent,
    private readonly onCut: (bush: Bush) => void,
  ) {
    super(scene, x, y - 4, 'bush');
    this.setDepth(depthAt(y));
    scene.add.existing(this);
  }

  onHit(): void {
    if (!this.active) return;
    // Leaves fly everywhere.
    for (let i = 0; i < 6; i++) {
      const leaf = this.scene.add.image(this.x, this.y, 'spark').setTint(0x5fb85a).setDepth(DEPTH.effects);
      const a = Math.random() * Math.PI * 2;
      this.scene.tweens.add({
        targets: leaf,
        x: this.x + Math.cos(a) * 24,
        y: this.y + Math.sin(a) * 18 - 8,
        angle: 180,
        alpha: 0,
        duration: 400,
        onComplete: () => leaf.destroy(),
      });
    }
    this.onCut(this);
    this.destroy();
  }
}

export type PickupKind = 'coin' | 'star' | 'key';

/** Something to collect by walking over it. */
export class Pickup extends Phaser.GameObjects.Image {
  readonly kind: PickupKind;
  /** Remember-id in the room ('' for dropped coins that don't need remembering). */
  readonly key: string;
  /** Position on the ground (the sprite floats a bit above it). */
  groundX: number;
  readonly groundY: number;
  collected = false;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: PickupKind, key = '', popOut = false) {
    super(scene, x, y - 8, kind);
    this.kind = kind;
    this.key = key;
    this.groundX = x;
    this.groundY = y;
    this.setDepth(depthAt(y));
    scene.add.existing(this);

    if (popOut) {
      // Jump out of a bush / enemy in a small arc.
      const tx = x + Phaser.Math.Between(-14, 14);
      this.groundX = tx;
      this.setScale(0.4);
      scene.tweens.add({ targets: this, x: tx, scale: 1, duration: 300, ease: 'Quad.easeOut' });
      scene.tweens.add({ targets: this, y: this.y - 18, duration: 150, yoyo: true, ease: 'Quad.easeOut' });
    }
    // Bob up and down; stars and keys also shimmer.
    scene.tweens.add({ targets: this, y: `-=4`, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: popOut ? 320 : 0 });
    if (kind !== 'coin') scene.tweens.add({ targets: this, angle: { from: -8, to: 8 }, duration: 900, yoyo: true, repeat: -1 });
  }

  collect(): void {
    if (this.collected) return;
    this.collected = true;
    this.scene.tweens.killTweensOf(this);
    const color = this.kind === 'coin' ? 0xffd23f : this.kind === 'star' ? 0xfff27a : 0x9fd8ff;
    hitSpark(this.scene, this.x, this.y, color, this.kind === 'coin' ? 5 : 12);
    this.scene.tweens.add({
      targets: this,
      y: this.y - 26,
      scale: this.kind === 'coin' ? 0.6 : 1.6,
      alpha: 0,
      duration: 300,
      onComplete: () => this.destroy(),
    });
  }
}

// ---------------------------------------------------------------------------
// Checkpoint & goal
// ---------------------------------------------------------------------------

/** A statue that saves your progress and heals the party when touched. */
export class Checkpoint extends Phaser.GameObjects.Image {
  activated = false;
  constructor(scene: Phaser.Scene, x: number, y: number, activated: boolean) {
    super(scene, x, y - 12, 'checkpoint');
    this.setDepth(depthAt(y));
    scene.add.existing(this);
    if (activated) this.light(false);
  }

  /** Turn on (with or without the fanfare). */
  light(withEffects = true): void {
    this.activated = true;
    this.setTint(0x9fffb0);
    this.scene.tweens.add({ targets: this, alpha: 0.75, duration: 700, yoyo: true, repeat: -1 });
    if (withEffects) {
      ring(this.scene, this.x, this.y + 12, 60, 0x7dff8a);
      popText(this.scene, this.x, this.y - 30, 'Checkpoint!', '#7dff8a', 18);
    }
  }
}

/** Swirling portal that ends the stage (temporary until the boss exists). */
export class GoalPortal extends Phaser.GameObjects.Image {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'portal');
    this.setDepth(DEPTH.shadows);
    scene.add.existing(this);
    scene.tweens.add({ targets: this, angle: 360, duration: 3000, repeat: -1 });
    scene.tweens.add({ targets: this, scale: 1.1, duration: 800, yoyo: true, repeat: -1 });
  }
}

/** Floor runes showing the crystal order (purely visual). */
export function crystalHint(scene: Phaser.Scene, x: number, y: number, order: number[]): void {
  const spacing = 22;
  const startX = x - ((order.length - 1) * spacing) / 2 + TILE / 2;
  const plate = scene.add.graphics().setDepth(DEPTH.shadows - 1);
  plate.fillStyle(0x000000, 0.35).fillRoundedRect(startX - 16, y - 14, (order.length - 1) * spacing + 32, 28, 8);
  plate.lineStyle(1, 0xffffff, 0.25).strokeRoundedRect(startX - 16, y - 14, (order.length - 1) * spacing + 32, 28, 8);
  order.forEach((id, i) => {
    scene.add.image(startX + i * spacing, y, 'gem').setTint(CRYSTAL_COLORS[id]).setDepth(DEPTH.shadows);
  });
}
