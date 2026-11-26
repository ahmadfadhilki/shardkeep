/**
 * StageRun: everything we must REMEMBER while playing one stage.
 *
 * Each room is rebuilt from scratch whenever you enter it (StageScene restarts),
 * so anything that should "stay changed" lives here instead: defeated enemies,
 * opened doors, collected coins, solved puzzles, party HP, the checkpoint...
 *
 * Long-term progress (XP, coins in the bank, best times) is in SaveData.ts instead.
 * XP is saved the moment you earn it; the coins you pick up here are only
 * added to your bank when you clear the stage.
 */

export const STARS_PER_STAGE = 3;

/** What we remember about one room. */
export interface RoomProgress {
  /** Spawn indexes of enemies that were defeated (they don't come back). */
  defeated: number[];
  /** Layout keys ("x,y") of collected coins/stars/keys. */
  collected: string[];
  /** Layout keys of broken bushes / cracked walls. */
  broken: string[];
  /** The room's lock (enemies / switches / crystals) has been solved: doors stay open. */
  solved: boolean;
  /** The key door in this room was opened. */
  keyDoorOpened: boolean;
  /** Where blocks ended up once the switch puzzle was solved. */
  blockTiles: [number, number][] | null;
  /** Visited before (so we only show the room hint the first time). */
  visited: boolean;
}

export class StageRun {
  readonly stageId: string;
  /** Seconds spent in the stage (pauses don't count; hit-stop does). */
  elapsed = 0;
  coins = 0;
  /** Ids of stars found ("roomId:x,y"). */
  stars: string[] = [];
  hasKey = false;
  /** The boss intro was shown once already (later visits get a short version). */
  bossIntroSeen = false;

  /** Party HP carried between rooms (null = full HP). */
  heroHp: number[] | null = null;
  /** Party mana carried between rooms (null = full mana). */
  heroMana: number[] | null = null;
  leaderIndex = 0;

  /** Where to respawn if the party is defeated (null = restart the stage). */
  checkpoint: { roomId: string; x: number; y: number } | null = null;

  /** XP earned from enemies during this run (the Results screen shows it). */
  xpGained = 0;
  /** Each hero's lifetime XP when the run started, so Results can animate the bars. */
  xpBefore: Record<string, number> = {};

  private rooms: Record<string, RoomProgress> = {};

  constructor(stageId: string) {
    this.stageId = stageId;
  }

  /** Progress for a room (created on first access). */
  room(id: string): RoomProgress {
    if (!this.rooms[id]) {
      this.rooms[id] = {
        defeated: [],
        collected: [],
        broken: [],
        solved: false,
        keyDoorOpened: false,
        blockTiles: null,
        visited: false,
      };
    }
    return this.rooms[id];
  }
}
