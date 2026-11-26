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
 *   b  brazier: hit it to light it; light them ALL at the same time (lock: 'braziers')
 *   c w t  enemies    K  the boss          (Ember Hollow)
 *   f i g  ice enemies  Q  the ice boss    (Frostmere Caves)   -- symbols are set in enemies.ts
 *
 * ICE: a room with `iceBlocks: true` has slippery floor: a pushed block keeps
 * sliding until it hits a wall, pillar or another block. Plan your pushes!
 *
 * EXITS: leave a gap (floor) in the outer wall. `exits` says which room each
 * side leads to. The matching room needs a gap on the opposite side.
 *
 * Every row of a room must have the same length.
 */

import type { ThemeId } from './themes';

export type Side = 'north' | 'south' | 'east' | 'west';

/** What opens the 'D' doors in a room. */
export type RoomLock = 'enemies' | 'switches' | 'crystals' | 'braziers';

export interface RoomDef {
  id: string;
  name: string;
  layout: string[];
  exits: Partial<Record<Side, string>>;
  /** Condition that opens this room's 'D' doors (default: defeat all enemies). */
  lock?: RoomLock;
  /** Crystal puzzle: crystal numbers in the order they must be hit. */
  crystalOrder?: number[];
  /** Brazier puzzle: seconds each brazier burns after being lit (default 8). */
  brazierTime?: number;
  /** Ice floor: pushed blocks slide until they hit something. */
  iceBlocks?: boolean;
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
  /** Look of the stage (tiles, background, snow). Default 'ember'. See themes.ts. */
  theme?: ThemeId;
  /** Bonus XP for every hero when the stage is cleared (default STAGE_CLEAR_XP). */
  clearXp?: number;
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
        exits: { south: 'switch', north: 'gallery' },
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
        // NEW PUZZLE: the braziers burn out after 12 s, so all four must burn at once.
        id: 'gallery',
        name: 'Cinder Gallery',
        lock: 'braziers',
        brazierTime: 12,
        exits: { south: 'crystal', north: 'boss' },
        hint: 'Light ALL the braziers at once. Each burns for 12 s. Arrows light them too!',
        layout: [
          '##############..##############',
          '#.............DD.............#',
          '#............................#',
          '#....b..................b....#',
          '#............................#',
          '#.......oo..........oo.......#',
          '#.......oo....c.....oo.......#',
          '#............................#',
          '#...c....................w...#',
          '#............................#',
          '#.......oo..........oo.......#',
          '#.......oo..........oo.......#',
          '#............................#',
          '#....b..................b....#',
          '#..........$......$..........#',
          '#............................#',
          '##############..##############',
        ],
      },
      {
        id: 'boss',
        name: 'Ember Throne',
        lock: 'enemies',
        exits: { south: 'gallery' },
        hint: 'Watch the red warnings! Make it crash into a pillar, or break its armor, to chain.',
        layout: [
          '##############################',
          '#............................#',
          '#.......w....................#',
          '#....oo..............oo......#',
          '#....oo..............oo......#',
          '#..............G.............#',
          '#............................#',
          '#..c...........K..........c..#',
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

  // ===========================================================================
  // FROSTMERE CAVES: the harder, snowy stage.
  //   gate (fight) -> slide (ice block puzzle) -> grotto (key + star, side room)
  //   slide -> hearth (braziers + key door + checkpoint) -> boss (Rime Colossus)
  // Most enemies are WATER: Earth heroes (Moss, Brask) deal x1.3 to them.
  // ===========================================================================
  {
    id: 'frostmere-caves',
    name: 'Frostmere Caves',
    description: 'A frozen maze of sliding ice and dying fires. The Rime Colossus waits on its throne.',
    recommendedLevel: 8,
    theme: 'frost',
    clearXp: 160,
    startRoom: 'gate',
    rooms: [
      {
        id: 'gate',
        name: 'Frozen Gate',
        lock: 'enemies',
        exits: { east: 'slide' },
        hint: 'These foes are WATER: Earth heroes hit them hard. Fire heroes, careful!',
        layout: [
          '########################################',
          '#......................................#',
          '#....i.....................i...........#',
          '#...oo.........#####.............oo....#',
          '#...oo.........#...#.............oo....#',
          '#..............#.$.#......f............#',
          '#.........f....#...#...................#',
          '#..............##.##...........#####...#',
          '#......................................#',
          '#...........ooo.........g.......#......#',
          '#...........o..........................#',
          '#..P........o......$..............f...D.',
          '#...........o.........................D.',
          '#...........ooo........................#',
          '#...................f...........#......#',
          '#.....g.........##.##...........#####..#',
          '#..............#...#...................#',
          '#..............#...#.......i...........#',
          '#..............#####...................#',
          '#...oo..........................oo.....#',
          '#...oo.....f....................oo.....#',
          '####...............$...................#',
          '#*.x...................................#',
          '########################################',
        ],
      },
      {
        // ICE PUZZLE. Each block needs two pushes; the pillars are the "brakes":
        //   upper-left block: push RIGHT (stops at the pillar), then DOWN onto a switch.
        //   lower-right block: push UP (stops under the pillar), then LEFT onto the other switch.
        id: 'slide',
        name: 'Glacier Slide',
        lock: 'switches',
        iceBlocks: true,
        exits: { west: 'gate', north: 'hearth', east: 'grotto' },
        hint: 'Ice! A pushed block slides until it hits something. Use the pillars to stop it. (Stuck? Reset room)',
        layout: [
          '##############..##############',
          '#.............DD.............#',
          '#............................#',
          '#............................#',
          '#...B................o.......#',
          '#............................#',
          '#.......................i....#',
          '........................o.....',
          '........o_....................',
          '#............................#',
          '#....f.......................#',
          '#.......................B....#',
          '#..................._........#',
          '#...................o........#',
          '#.......................f....#',
          '#............................#',
          '##############################',
        ],
      },
      {
        id: 'grotto',
        name: 'Snowdrift Grotto',
        exits: { west: 'slide' },
        hint: 'Something is buried under the snow...',
        layout: [
          '##############################',
          '#............................#',
          '#..%%%.........i........%%%..#',
          '#..%@%..................%&%..#',
          '#..%%%..................%%%..#',
          '#............................#',
          '#.......f........o...........#',
          '.............................#',
          '..............$..............#',
          '#.........o..........f.......#',
          '#............................#',
          '#.....%%%..........%%%.......#',
          '#.....%$%....g.....%%%.......#',
          '#.....%%%..........%%%.......#',
          '#..................i.........#',
          '#............................#',
          '##############################',
        ],
      },
      {
        // Braziers again, but five of them, a shorter timer, and wisps shooting at you.
        // The key from the grotto opens the second gate (LL).
        id: 'hearth',
        name: 'Hearth Hall',
        lock: 'braziers',
        brazierTime: 11,
        exits: { south: 'slide', north: 'boss' },
        hint: 'Light all five braziers at once (11 s each). The locked gate needs a key.',
        layout: [
          '##############..##############',
          '#.............LL.............#',
          '#.............DD.............#',
          '#............................#',
          '#...b....................b...#',
          '#............................#',
          '#.......i............i.......#',
          '#..........oo....oo..........#',
          '#..............C.............#',
          '#..........oo....oo..........#',
          '#....f..................f....#',
          '#............................#',
          '#...b..........b.........b...#',
          '###x.........................#',
          '#*.x.........................#',
          '####........$.......$........#',
          '##############..##############',
        ],
      },
      {
        id: 'boss',
        name: 'Frozen Throne',
        lock: 'enemies',
        exits: { south: 'hearth' },
        hint: 'Bait its charge into a pillar, or break its armor, to chain. It throws ice rings from the start!',
        layout: [
          '##############################',
          '#............................#',
          '#.......i............i.......#',
          '#....oo..............oo......#',
          '#....oo..............oo......#',
          '#..............G.............#',
          '#............................#',
          '#..f...........Q..........f..#',
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
