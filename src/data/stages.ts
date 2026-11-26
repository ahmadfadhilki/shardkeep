/**
 * STAGE DATA
 * ----------
 * A stage is a set of rooms. Each room is drawn as ASCII text: one character
 * = one tile (32x32 px), so you can design levels in a plain text editor.
 *
 * LEGEND
 *   #  wall                  .  floor               o  pillar (wall)
 *   P  party start (only in the stage's first room)
 *   x  cracked wall: breaks when hit. Hides secrets!
 *   D  door: opens when the room's `lock` is solved
 *   L  locked door: opens with a key
 *   B  push block            _  pressure switch (push a block onto it)
 *   1 2 3 4  crystals (hit them in the order shown by the hint)
 *   h  crystal hint (floor runes showing the order)
 *   %  bush (may drop a coin)    &  bush hiding the KEY    @  bush hiding a STAR
 *   $  coin                  *  star                C  checkpoint statue
 *   G  goal portal: appears when the room is solved (e.g. boss defeated)
 *   c w t  enemies    K  the boss (symbols are set in enemies.ts)
 *
 * EXITS: leave a gap (floor) in the outer wall. `exits` says which room each
 * side leads to. The matching room needs a gap on the opposite side.
 *
 * Every row of a room must have the same length.
 */

export type Side = 'north' | 'south' | 'east' | 'west';

/** What opens the 'D' doors in a room. */
export type RoomLock = 'enemies' | 'switches' | 'crystals';

export interface RoomDef {
  id: string;
  name: string;
  layout: string[];
  exits: Partial<Record<Side, string>>;
  /** Condition that opens this room's 'D' doors (default: defeat all enemies). */
  lock?: RoomLock;
  /** Crystal puzzle: crystal numbers in the order they must be hit. */
  crystalOrder?: number[];
  /** Optional text shown when entering the room for the first time. */
  hint?: string;
}

export interface StageDef {
  id: string;
  name: string;
  /** Short text shown on the Stage Select card. */
  description: string;
  /** Suggested party level. Stage Select compares it with your level to show the difficulty. */
  recommendedLevel: number;
  /** Room where the party starts (must contain 'P'). */
  startRoom: string;
  rooms: RoomDef[];
}

export const STAGES: StageDef[] = [
  {
    id: 'ember-hollow',
    name: 'Ember Hollow',
    description: 'A smoldering cave of puzzles. The Ashen Warden waits on its throne.',
    recommendedLevel: 3,
    startRoom: 'entrance',
    rooms: [
      {
        id: 'entrance',
        name: 'Hollow Entrance',
        lock: 'enemies',
        exits: { east: 'switch' },
        hint: 'Defeat the monsters to open the door.',
        // 40 x 24 tiles = 1280 x 768 px, bigger than the screen so the camera scrolls.
        layout: [
          '########################################',
          '#..........w...........................#',
          '#.....$................................#',
          '#...oo..............##.............oo..#',
          '#...oo..............##.............oo..#',
          '#.....................c................#',
          '#..........#####..........#####........#',
          '#..........#...............#...........#',
          '#..........#...............#...........#',
          '#....c.................................#',
          '#.......o..........................o...#',
          '#..P...............................w..D.',
          '#..................................$..D.',
          '#.......o..........................o...#',
          '#..............c............t..........#',
          '#..........#...............#...........#',
          '#..........#...............#...........#',
          '#..........#####..........#####........#',
          '#......$...............................#',
          '#...oo..............##.............oo..#',
          '####...c.......................w.......#',
          '#*.x...................................#',
          '####...................................#',
          '########################################',
        ],
      },
      {
        id: 'switch',
        name: 'Switch Chamber',
        lock: 'switches',
        exits: { west: 'entrance', east: 'garden', north: 'crystal' },
        hint: 'Push the blocks onto both switches. (Stuck? Press R to reset the room.)',
        layout: [
          '##############..##############',
          '#.............LL.............#',
          '#............................#',
          '#....................%%......#',
          '#...######.......#######.....#',
          '#...#.......................$#',
          '#...#...B.....o....._........#',
          '............................D.',
          '............................D.',
          '#...#...B.....o....._........#',
          '#...#........................#',
          '#...######.......#######.....#',
          '#............................#',
          '#..c......................c..#',
          '#............................#',
          '#............................#',
          '##############################',
        ],
      },
      {
        id: 'garden',
        name: 'Bramble Garden',
        exits: { west: 'switch' },
        hint: 'Something glints among the bushes...',
        layout: [
          '##############################',
          '#%%%.........................#',
          '#%&%......%%%........w.......#',
          '#%%%......%@%................#',
          '#.........%%%.........$......#',
          '#............................#',
          '#.....c..........o.......c...#',
          '.............................#',
          '.............$...............#',
          '#............................#',
          '#....%%%........o.......%%%..#',
          '#....%$%................%%%..#',
          '#....%%%.......w........%%%..#',
          '#............................#',
          '#..t.........................#',
          '#............................#',
          '##############################',
        ],
      },
      {
        id: 'crystal',
        name: 'Crystal Hall',
        lock: 'crystals',
        crystalOrder: [2, 4, 1, 3],
        exits: { south: 'switch', north: 'boss' },
        hint: 'The runes show an order. Strike the crystals to match it.',
        layout: [
          '##############..##############',
          '#.............DD.............#',
          '#............................#',
          '#.............h..............#',
          '#....1..................2....#',
          '#............................#',
          '#............................#',
          '#......w..............w......#',
          '#....3.........C........4....#',
          '#............................#',
          '#............................#',
          '###x.........................#',
          '#*.x.........................#',
          '####.........................#',
          '#.......$...........$........#',
          '#............................#',
          '##############..##############',
        ],
      },
      {
        id: 'boss',
        name: 'Ember Throne',
        lock: 'enemies',
        exits: { south: 'crystal' },
        hint: 'Watch the red warnings! Make it crash into a pillar, or break its armor, to chain.',
        layout: [
          '##############################',
          '#............................#',
          '#............................#',
          '#....oo..............oo......#',
          '#....oo..............oo......#',
          '#..............G.............#',
          '#............................#',
          '#..............K.............#',
          '#............................#',
          '#............................#',
          '#............................#',
          '#....oo..............oo......#',
          '#....oo..............oo......#',
          '#............................#',
          '#............................#',
          '#.............DD.............#',
          '##############..##############',
        ],
      },
    ],
  },
];

export function getStageDef(id: string): StageDef {
  const def = STAGES.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown stage id: ${id}`);
  return def;
}

export function getRoomDef(stage: StageDef, roomId: string): RoomDef {
  const room = stage.rooms.find((r) => r.id === roomId);
  if (!room) throw new Error(`Stage "${stage.id}" has no room "${roomId}"`);
  return room;
}

/** The side you arrive on when leaving through `side` (east exit -> arrive on the west). */
export function oppositeSide(side: Side): Side {
  return ({ north: 'south', south: 'north', east: 'west', west: 'east' } as const)[side];
}
