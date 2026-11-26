/**
 * Global constants shared by the whole game.
 * Changing a value here changes it everywhere, which avoids "magic numbers"
 * scattered through the code.
 */

/** Internal resolution of the game canvas (it is scaled to fit the window). */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

/** Size of one map tile in pixels. Room layouts are measured in tiles. */
export const TILE = 32;

/** Colors used for placeholder art and UI (hex numbers, Phaser style). */
export const COLORS = {
  background: 0x120e18,
  floorA: 0x3d3350,
  floorB: 0x392f4b,
  floorSpeck: 0x463b5c,
  wallFace: 0x2a2236,
  wallTop: 0x5a4a72,
  wallEdge: 0x7a6896,
  outline: 0x1a1422,
  white: 0xffffff,
  uiText: '#f4ecff',
  uiAccent: '#ffcf5a',
} as const;

/** Depth (draw order) layers. Entities use their y position on top of DEPTH.entities. */
export const DEPTH = {
  floor: 0,
  walls: 1,
  shadows: 5,
  entities: 10, // entities get 10 + y, so lower things draw in front
  effects: 100000,
  ui: 200000,
} as const;
