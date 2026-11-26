import Phaser from 'phaser';
import { TILE } from '../config';
import type { RoomDef } from '../data/stages';
import type { Hero } from '../entities/Hero';
import {
  Bush,
  Checkpoint,
  Crystal,
  CrackedWall,
  Door,
  GoalPortal,
  Pickup,
  PressurePlate,
  PushBlock,
  crystalHint,
  type BushContent,
  type PickupKind,
} from '../entities/Props';
import type { CombatSystem } from './CombatSystem';
import type { BuiltRoom } from './RoomBuilder';
import type { RoomProgress, StageRun } from './StageRun';
import { popText } from './Effects';

/** Things the room tells the StageScene about. */
export interface RoomEvents {
  onCollect(kind: PickupKind): void;
  onCheckpoint(x: number, y: number): void;
  onGoal(): void;
  onSolved(): void;
}

/** How long you must keep walking into a block before it moves (s). */
const PUSH_DELAY = 0.18;

/**
 * RoomController: owns the props of the current room and runs its puzzles.
 *
 *  - Builds doors, blocks, switches, crystals, bushes, pickups... from the layout,
 *    skipping anything StageRun says is already broken / collected / solved.
 *  - Checks the room's LOCK every frame (enemies / switches / crystals) and
 *    opens the 'D' doors when it is solved.
 *  - Handles block pushing, picking things up, the key door, checkpoint and goal.
 */
export class RoomController {
  /** Static physics group for everything solid (doors, blocks, cracked walls). */
  readonly solids: Phaser.Physics.Arcade.StaticGroup;

  private doors: Door[] = [];
  private keyDoors: Door[] = [];
  private blocks: PushBlock[] = [];
  private plates: PressurePlate[] = [];
  private crystals: Crystal[] = [];
  private pickups: Pickup[] = [];
  private checkpoint?: Checkpoint;
  private goal?: GoalPortal;

  private progress: RoomProgress;
  private crystalStep = 0;
  private pushTimer = 0;
  private lockedMsgTimer = 0;
  private goalReached = false;
  private goalSpot?: { x: number; y: number };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly combat: CombatSystem,
    private readonly run: StageRun,
    private readonly def: RoomDef,
    private readonly room: BuiltRoom,
    private readonly events: RoomEvents,
  ) {
    this.progress = run.room(def.id);
    this.solids = scene.physics.add.staticGroup();
    this.build();
  }

  // -------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------

  private build(): void {
    const p = this.progress;
    for (const o of this.room.objects) {
      const collected = p.collected.includes(o.key);
      const broken = p.broken.includes(o.key);

      switch (o.char) {
        case 'D':
          if (!p.solved) this.doors.push(this.solid(new Door(this.scene, o.x, o.y, false)));
          break;
        case 'L':
          if (!p.keyDoorOpened) this.keyDoors.push(this.solid(new Door(this.scene, o.x, o.y, true)));
          break;
        case 'x':
          if (!broken) {
            const wall = new CrackedWall(this.scene, o.x, o.y, () => p.broken.push(o.key));
            this.solid(wall);
            this.combat.hittables.push(wall);
          }
          break;
        case 'B':
          // Blocks are placed later (their position may have been saved).
          break;
        case '_':
          this.plates.push(new PressurePlate(this.scene, o.tx, o.ty));
          break;
        case '1':
        case '2':
        case '3':
        case '4': {
          const crystal = new Crystal(this.scene, o.x, o.y, Number(o.char), (c) => this.onCrystalStruck(c));
          if (p.solved) crystal.setLit(true);
          this.crystals.push(crystal);
          this.combat.hittables.push(crystal);
          break;
        }
        case 'h':
          crystalHint(this.scene, o.x, o.y, this.def.crystalOrder ?? []);
          break;
        case '%':
        case '&':
        case '@': {
          const content: BushContent = o.char === '&' ? 'key' : o.char === '@' ? 'star' : 'none';
          if (collected) break; // its treasure was already taken: bush stays cut
          if (broken) {
            // Bush already cut but its treasure is still lying there.
            if (content !== 'none') this.addPickup(o.x, o.y, content, o.key);
            break;
          }
          const bush = new Bush(this.scene, o.x, o.y, content, () => this.onBushCut(bush, o.key, o.x, o.y));
          this.combat.hittables.push(bush);
          break;
        }
        case '$':
          if (!collected) this.addPickup(o.x, o.y, 'coin', o.key);
          break;
        case '*':
          if (!collected) this.addPickup(o.x, o.y, 'star', o.key);
          break;
        case 'C': {
          const active = this.run.checkpoint?.roomId === this.def.id;
          this.checkpoint = new Checkpoint(this.scene, o.x, o.y, active);
          break;
        }
        case 'G':
          // The portal appears once the room is solved (rooms without a lock: right away).
          this.goalSpot = o;
          if (!this.def.lock || p.solved) this.goal = new GoalPortal(this.scene, o.x, o.y);
          break;
      }
    }

    // Blocks: at their saved spots if the puzzle was solved, otherwise at the start.
    const startTiles = this.room.objects.filter((o) => o.char === 'B').map((o) => [o.tx, o.ty] as [number, number]);
    const tiles = p.solved && p.blockTiles ? p.blockTiles : startTiles;
    for (const [tx, ty] of tiles) this.blocks.push(this.solid(new PushBlock(this.scene, tx, ty)));
    this.updatePlates();
  }

  /** Give a prop a static physics body by adding it to the solids group. */
  private solid<T extends Phaser.GameObjects.Image>(obj: T): T {
    this.solids.add(obj);
    return obj;
  }

  private addPickup(x: number, y: number, kind: PickupKind, key = '', popOut = false): void {
    this.pickups.push(new Pickup(this.scene, x, y, kind, key, popOut));
  }

  /** Coins burst out of a defeated enemy (not remembered: they're a reward on the spot). */
  dropCoins(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) this.addPickup(x, y, 'coin', '', true);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** True if a projectile at (x, y) should stop: wall tile or solid prop. */
  solidAt(x: number, y: number): boolean {
    if (this.room.isWallTile(Math.floor(x / TILE), Math.floor(y / TILE))) return true;
    for (const child of this.solids.getChildren()) {
      const body = (child as Phaser.GameObjects.Image).body as Phaser.Physics.Arcade.StaticBody | null;
      if (body?.enable && body.hitTest(x, y)) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Per-frame logic
  // -------------------------------------------------------------------------

  update(dt: number, leader: Hero, heroes: Hero[], move: Phaser.Math.Vector2, enemiesAlive: number): void {
    this.lockedMsgTimer -= dt;
    this.handlePush(dt, leader, move);
    this.handlePickups(leader, heroes);
    this.handleKeyDoors(leader);
    this.checkLock(enemiesAlive);

    if (this.checkpoint && !this.checkpoint.activated && this.near(leader, this.checkpoint.x, this.checkpoint.y + 12, 34)) {
      this.checkpoint.light();
      this.events.onCheckpoint(this.checkpoint.x, this.checkpoint.y + 50);
    }
    if (this.goal && !this.goalReached && this.near(leader, this.goal.x, this.goal.y, 22)) {
      this.goalReached = true;
      this.events.onGoal();
    }
  }

  /** Is the room's door condition met? Opens the doors once. */
  private checkLock(enemiesAlive: number): void {
    if (this.progress.solved) return;
    const lock = this.def.lock ?? 'enemies';
    let solved = false;
    if (lock === 'enemies') solved = enemiesAlive === 0;
    if (lock === 'switches') solved = this.plates.length > 0 && this.plates.every((p) => p.pressed);
    if (lock === 'crystals') solved = this.crystals.length > 0 && this.crystalStep >= (this.def.crystalOrder?.length ?? 0);
    if (!solved) return;

    this.progress.solved = true;
    if (lock === 'switches') this.progress.blockTiles = this.blocks.map((b) => [b.tx, b.ty]);
    if (this.doors.length > 0) {
      for (const d of this.doors) d.open();
      this.doors = [];
      this.events.onSolved();
    }
    if (this.goalSpot && !this.goal) {
      this.goal = new GoalPortal(this.scene, this.goalSpot.x, this.goalSpot.y);
      this.goal.setScale(0);
      this.scene.tweens.add({ targets: this.goal, scale: 1, duration: 600, ease: 'Back.easeOut' });
    }
  }

  /**
   * Block pushing: if the leader keeps walking straight into a block for a
   * moment, the block slides one tile in that direction (if the tile is free).
   */
  private handlePush(dt: number, leader: Hero, move: Phaser.Math.Vector2): void {
    // Only straight (not diagonal) pushes.
    const dx = Math.round(move.x);
    const dy = Math.round(move.y);
    if (Math.abs(dx) + Math.abs(dy) !== 1) {
      this.pushTimer = 0;
      return;
    }
    const block = this.blocks.find((b) => {
      if (b.moving) return false;
      const ox = b.x - leader.x;
      const oy = b.y - leader.y;
      if (dx !== 0) return Math.sign(ox) === dx && Math.abs(ox) < TILE / 2 + 14 && Math.abs(oy) < 14;
      return Math.sign(oy) === dy && Math.abs(oy) < TILE / 2 + 12 && Math.abs(ox) < 14;
    });
    if (!block) {
      this.pushTimer = 0;
      return;
    }
    this.pushTimer += dt;
    if (this.pushTimer < PUSH_DELAY) return;
    this.pushTimer = 0;
    block.push(dx, dy, (tx, ty) => this.canBlockEnter(tx, ty), () => this.updatePlates());
  }

  /** A block may slide onto a tile that is floor and not occupied by another solid thing. */
  private canBlockEnter(tx: number, ty: number): boolean {
    if (tx <= 0 || ty <= 0 || tx >= this.room.widthTiles - 1 || ty >= this.room.heightTiles - 1) return false;
    if (this.room.isWallTile(tx, ty)) return false;
    if (this.blocks.some((b) => b.tx === tx && b.ty === ty)) return false;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    if (this.solidAt(cx, cy)) return false;
    if (this.crystals.some((c) => Math.abs(c.x - cx) < TILE && Math.abs(c.y + 10 - cy) < TILE)) return false;
    return true;
  }

  private updatePlates(): void {
    for (const plate of this.plates) {
      plate.setPressed(this.blocks.some((b) => b.tx === plate.tx && b.ty === plate.ty));
    }
  }

  private onCrystalStruck(crystal: Crystal): void {
    const order = this.def.crystalOrder ?? [];
    if (this.progress.solved || crystal.lit) return;
    if (crystal.id === order[this.crystalStep]) {
      crystal.setLit(true);
      this.crystalStep++;
    } else {
      // Wrong order: everything resets.
      this.crystalStep = 0;
      for (const c of this.crystals) {
        c.setLit(false);
        c.buzz();
      }
      popText(this.scene, crystal.x, crystal.y - 26, 'Wrong order!', '#ff5a5a', 15);
      this.scene.cameras.main.shake(100, 0.003);
    }
  }

  private onBushCut(bush: Bush, key: string, x: number, y: number): void {
    this.progress.broken.push(key);
    this.combat.hittables = this.combat.hittables.filter((h) => h !== bush);
    if (bush.content === 'key' || bush.content === 'star') this.addPickup(x, y, bush.content, key, true);
    else if (Math.random() < 0.35) this.addPickup(x, y, 'coin', '', true);
  }

  private handlePickups(leader: Hero, heroes: Hero[]): void {
    for (const p of this.pickups) {
      if (p.collected) continue;
      // Coins drift toward the leader when close (a "magnet" feels nicer).
      const dl = Phaser.Math.Distance.Between(leader.x, leader.y, p.groundX, p.groundY);
      if (p.kind === 'coin' && dl < 70 && dl > 4) {
        const step = 4;
        const nx = (leader.x - p.groundX) / dl;
        p.groundX += nx * step;
        p.x += nx * step;
      }
      const taker = heroes.find((h) => !h.dead && Phaser.Math.Distance.Between(h.x, h.y, p.groundX, p.groundY) < 22);
      if (!taker) continue;
      p.collect();
      if (p.key) this.progress.collected.push(p.key);
      if (p.kind === 'star') this.run.stars.push(`${this.def.id}:${p.key}`);
      if (p.kind === 'coin') this.run.coins++;
      if (p.kind === 'key') this.run.hasKey = true;
      this.events.onCollect(p.kind);
    }
    this.pickups = this.pickups.filter((p) => !p.collected);
  }

  private handleKeyDoors(leader: Hero): void {
    if (this.keyDoors.length === 0) return;
    const near = this.keyDoors.some((d) => this.near(leader, d.x, d.y, 44));
    if (!near) return;
    if (this.run.hasKey) {
      this.run.hasKey = false;
      this.progress.keyDoorOpened = true;
      for (const d of this.keyDoors) d.open();
      popText(this.scene, leader.x, leader.y - 50, 'Unlocked!', '#9fd8ff', 18);
      this.keyDoors = [];
    } else if (this.lockedMsgTimer <= 0) {
      this.lockedMsgTimer = 2;
      popText(this.scene, leader.x, leader.y - 50, 'Locked. Find the key!', '#9fd8ff', 15);
    }
  }

  private near(hero: Hero, x: number, y: number, dist: number): boolean {
    return Phaser.Math.Distance.Between(hero.x, hero.y, x, y) < dist;
  }
}
