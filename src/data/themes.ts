/**
 * STAGE THEMES
 * ------------
 * A theme is the look of a stage: the colors of its floor and wall tiles, the
 * background, and optional weather. BootScene draws one tile strip per theme
 * (texture key `tileKey`), and RoomBuilder uses the stage's strip.
 *
 * To add a theme: add an entry here, then set `theme: '<id>'` on a stage in stages.ts.
 */

export type ThemeId = 'ember' | 'frost';

export interface ThemeDef {
  id: ThemeId;
  /** Texture key of this theme's tile strip (made in BootScene). */
  tileKey: string;
  background: number;
  floorA: number;
  floorB: number;
  floorSpeck: number;
  wallTop: number;
  wallEdge: number;
  wallFace: number;
  /** Falling snow over the whole screen. */
  snow?: boolean;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  // Warm purple stone (the original look).
  ember: {
    id: 'ember',
    tileKey: 'tiles',
    background: 0x120e18,
    floorA: 0x3d3350,
    floorB: 0x392f4b,
    floorSpeck: 0x463b5c,
    wallTop: 0x5a4a72,
    wallEdge: 0x7a6896,
    wallFace: 0x2a2236,
  },
  // Pale icy blues, with snow falling.
  frost: {
    id: 'frost',
    tileKey: 'tiles-frost',
    background: 0x0c1420,
    floorA: 0x7da3c0,
    floorB: 0x759bb8,
    floorSpeck: 0xd8ecfa,
    wallTop: 0xdbeefa,
    wallEdge: 0xf6fcff,
    wallFace: 0x4d7394,
    snow: true,
  },
};
