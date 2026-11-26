import Phaser from 'phaser';
import { DEPTH, TILE } from '../config';
import type { RoomDef, Side } from '../data/stages';
import { getEnemyBySymbol, type EnemyDef } from '../data/enemies';

/**
 * Tile indices inside the generated "tiles" texture (see BootScene).
 * Each index is one 32x32 frame in a horizontal strip.
 */
export const TILE_INDEX = {
  floorA: 0,
  floorB: 1,
  wallTop: 2, // a wall seen from above (wall below it too)
  wallFace: 3, // a wall whose front face is visible (floor below it)
  floorShadow: 4, // floor right under a wall, slightly darker
} as const;

/** Tiles nobody can walk through. */
const SOLID = [TILE_INDEX.wallTop, TILE_INDEX.wallFace];

/** Characters that become wall TILES. */
const WALL_CHARS = new Set(['#', 'o']);

/** Characters that become puzzle/prop OBJECTS (floor underneath). See stages.ts legend. */
const OBJECT_CHARS = new Set(['x', 'D', 'L', 'B', '_', '1', '2', '3', '4', 'h', '%', '&', '@', '$', '*', 'C', 'G', 'b']);

/** A prop found in the layout. */
export interface RoomObject {
  char: string;
  /** Tile coordinates. */
  tx: number;
  ty: number;
  /** Pixel coordinates of the tile center. */
  x: number;
  y: number;
  /** Unique id inside the room, used to remember it (e.g. "collected"). */
  key: string;
}

export interface EnemySpawn {
  def: EnemyDef;
  x: number;
  y: number;
  /** Index in the room, used to remember which enemies were defeated. */
  index: number;
}

/** Everything a scene needs to know about a room after it is built. */
export interface BuiltRoom {
  map: Phaser.Tilemaps.Tilemap;
  layer: Phaser.Tilemaps.TilemapLayer;
  widthTiles: number;
  heightTiles: number;
  widthPx: number;
  heightPx: number;
  /** Where the party starts if the room has a 'P'. */
  playerSpawn: Phaser.Math.Vector2 | null;
  enemySpawns: EnemySpawn[];
  objects: RoomObject[];
  /** Floor tiles in the outer wall, per side: these are the exits. */
  gaps: Record<Side, { tx: number; ty: number }[]>;
  /** True if tile (tx, ty) is a wall tile (or outside the map). */
  isWallTile(tx: number, ty: number): boolean;
}

/**
 * Turns an ASCII room layout into a real Phaser tilemap with collisions,
 * plus lists of enemies, props and exits found in it.
 *
 * Why choose wall tiles by looking at neighbors? A wall with floor below it
 * shows its front "face", which gives a cheap fake-3D look with zero art work.
 */
/** `tileKey` = which tile strip to use (the stage theme's, see data/themes.ts). */
export function buildRoom(scene: Phaser.Scene, room: RoomDef, tileKey = 'tiles'): BuiltRoom {
  const rows = room.layout;
  const h = rows.length;
  const w = rows[0].length;
  const isWall = (x: number, y: number) => {
    if (y < 0 || y >= h || x < 0 || x >= w) return true; // outside counts as wall
    return WALL_CHARS.has(rows[y][x]);
  };

  let playerSpawn: Phaser.Math.Vector2 | null = null;
  const enemySpawns: EnemySpawn[] = [];
  const objects: RoomObject[] = [];
  const gaps: BuiltRoom['gaps'] = { north: [], south: [], east: [], west: [] };
  const data: number[][] = [];

  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) {
      throw new Error(`Room "${room.id}": row ${y} has length ${rows[y].length}, expected ${w}`);
    }
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (WALL_CHARS.has(ch)) {
        // Wall: show its face if the tile below is walkable.
        row.push(isWall(x, y + 1) ? TILE_INDEX.wallTop : TILE_INDEX.wallFace);
        continue;
      }

      // Everything else stands on floor.
      if (isWall(x, y - 1)) row.push(TILE_INDEX.floorShadow);
      else row.push(hash(x, y) % 5 === 0 ? TILE_INDEX.floorB : TILE_INDEX.floorA);

      const c = tileCenter(x, y);
      if (ch === 'P') playerSpawn = c;
      if (OBJECT_CHARS.has(ch)) objects.push({ char: ch, tx: x, ty: y, x: c.x, y: c.y, key: `${x},${y}` });
      const enemy = getEnemyBySymbol(ch);
      if (enemy) enemySpawns.push({ def: enemy, x: c.x, y: c.y, index: enemySpawns.length });

      // A walkable tile on the border is an exit.
      if (y === 0) gaps.north.push({ tx: x, ty: y });
      if (y === h - 1) gaps.south.push({ tx: x, ty: y });
      if (x === 0) gaps.west.push({ tx: x, ty: y });
      if (x === w - 1) gaps.east.push({ tx: x, ty: y });
    }
    data.push(row);
  }

  const map = scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
  const tileset = map.addTilesetImage(tileKey, tileKey, TILE, TILE, 0, 0)!;
  const layer = map.createLayer(0, tileset, 0, 0)!;
  layer.setDepth(DEPTH.floor);
  layer.setCollision(SOLID);

  return {
    map,
    layer,
    widthTiles: w,
    heightTiles: h,
    widthPx: w * TILE,
    heightPx: h * TILE,
    playerSpawn,
    enemySpawns,
    objects,
    gaps,
    isWallTile: isWall,
  };
}

/**
 * Where the party appears when entering through `side`: the middle of that
 * side's exit gap, moved a couple of tiles into the room (past any doors).
 */
export function entryPoint(room: BuiltRoom, side: Side): Phaser.Math.Vector2 {
  const gap = room.gaps[side];
  if (gap.length === 0) throw new Error(`Room has no exit on the ${side} side`);
  const avgX = gap.reduce((s, g) => s + g.tx, 0) / gap.length;
  const avgY = gap.reduce((s, g) => s + g.ty, 0) / gap.length;
  const p = new Phaser.Math.Vector2(avgX * TILE + TILE / 2, avgY * TILE + TILE / 2);
  const inward = TILE * 2.5;
  if (side === 'north') p.y += inward;
  if (side === 'south') p.y -= inward;
  if (side === 'west') p.x += inward;
  if (side === 'east') p.x -= inward;
  return p;
}

/** Pixel position of the center of tile (x, y). */
export function tileCenter(x: number, y: number): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2(x * TILE + TILE / 2, y * TILE + TILE / 2);
}

/** Small deterministic "random" number so the floor pattern is the same every time. */
function hash(x: number, y: number): number {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return Math.abs(n ^ (n >> 16));
}
