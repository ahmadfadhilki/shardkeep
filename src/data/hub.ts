import type { RoomDef } from './stages';

/**
 * HUB TOWN DATA: Emberwick, the little town between stages.
 *
 * The town map uses the same ASCII format as the dungeon rooms
 * (# wall, o pillar/lamp, . floor, P where the party appears).
 * NPCs are listed separately with tile coordinates.
 */

export const HUB_ROOM: RoomDef = {
  id: 'hub',
  name: 'Emberwick',
  exits: {},
  layout: [
    '####################################',
    '#..................................#',
    '#..................................#',
    '#..................................#',
    '#...ooooo..........................#',
    '#..................................#',
    '#..o............................o..#',
    '#..................................#',
    '#..................................#',
    '#................oo................#',
    '#................oo................#',
    '#..................................#',
    '#..o............................o..#',
    '#..................................#',
    '#..................................#',
    '#................P.................#',
    '#..................................#',
    '#..................................#',
    '#..................................#',
    '####################################',
  ],
};

/**
 * What talking to an NPC does:
 *   shop   - opens the shop (potions, weapon upgrades)
 *   stages - goes to Stage Select
 *   party  - opens the party setup (who joins, who leads, levels)
 *   talk   - just says one of its lines (a new one each time)
 */
export type NpcKind = 'shop' | 'stages' | 'party' | 'talk';

export interface NpcDef {
  id: string;
  name: string;
  kind: NpcKind;
  /** Tile position. */
  tx: number;
  ty: number;
  /** Robe color of the placeholder sprite. */
  color: number;
  /** Prompt shown when you stand near: "[E] <action>". */
  action: string;
  /** Lines said when you talk to it (one per talk, in order). */
  lines: string[];
}

export const HUB_NPCS: NpcDef[] = [
  {
    id: 'tilda',
    name: 'Tilda',
    kind: 'shop',
    tx: 6,
    ty: 3,
    color: 0xc77dff,
    action: 'Shop',
    lines: ['Potions, sharper steel, and brave souls for hire! Coins only, no credit.'],
  },
  {
    id: 'orin',
    name: 'Gatekeeper Orin',
    kind: 'stages',
    tx: 28,
    ty: 2,
    color: 0x8a8a9a,
    action: 'Go adventuring',
    lines: ['The gate is open. Where to?'],
  },
  {
    id: 'bram',
    name: 'Elder Bram',
    kind: 'party',
    tx: 7,
    ty: 14,
    color: 0xd9a066,
    action: 'Party setup',
    lines: ['Who will you take on your next adventure? Bring up to three... or go alone, if you dare.'],
  },
  {
    id: 'pip',
    name: 'Pip',
    kind: 'talk',
    tx: 27,
    ty: 14,
    color: 0x6ad1c4,
    action: 'Talk',
    lines: [
      'Levels give more HP, faster skills and cheaper mana. Not more damage!',
      'Want to hit harder? Tilda upgrades weapons.',
      'Too easy? Fight the Warden at a low level. Too hard? Replay a stage to grow.',
      'You keep XP even if your party falls. Coins only count when you clear.',
      'Landing normal hits fills your mana faster.',
      'Tilda knows heroes looking for work. Recruit them, then ask Elder Bram to set up your party.',
      'Press Esc during a stage to pause. Press M anywhere to mute the sound.',
    ],
  },
];
