import { HEROES, MAX_PARTY, STARTER_HEROES } from '../data/heroes';
import { levelFromXp, MAX_LEVEL, totalXpForLevel, type PotionKind } from '../data/progression';

/**
 * SAVE DATA (localStorage)
 * ------------------------
 * Everything that should survive closing the browser lives in one small
 * JSON object. We keep ONE copy in memory (`current`), change it while
 * playing, and write it to localStorage with saveGame().
 *
 * Tip: open the browser console and type
 *   JSON.parse(localStorage.getItem('shardkeep-save'))
 * to look at your save. localStorage.removeItem('shardkeep-save') deletes it.
 */

const STORAGE_KEY = 'shardkeep-save';
/** Bump this when the save format changes in a way old saves can't handle. */
const SAVE_VERSION = 1;

export interface HeroSave {
  /** Lifetime XP. The level is computed from it (see levelFromXp). */
  xp: number;
  /** Number of weapon upgrades bought (0 = starting weapon). */
  weapon: number;
}

export interface StageSave {
  cleared: boolean;
  /** Fastest clear in seconds (0 = never cleared). */
  bestTime: number;
  /** Star ids ever found in this stage. */
  stars: string[];
}

export interface SaveFile {
  version: number;
  coins: number;
  heroes: Record<string, HeroSave>;
  potions: Record<PotionKind, number>;
  stages: Record<string, StageSave>;
  /** Ids of heroes you own (starters + recruited in the shop). */
  roster: string[];
  /** Ids of the heroes you bring into stages, in order (first = starts as leader). 1 to 3 heroes. */
  party: string[];
  settings: { muted: boolean };
}

function freshSave(): SaveFile {
  const heroes: Record<string, HeroSave> = {};
  for (const h of HEROES) heroes[h.id] = { xp: 0, weapon: 0 };
  return {
    version: SAVE_VERSION,
    coins: 0,
    heroes,
    potions: { health: 2, mana: 1 },
    stages: {},
    roster: [...STARTER_HEROES],
    party: [...STARTER_HEROES].slice(0, MAX_PARTY),
    settings: { muted: false },
  };
}

let current: SaveFile | null = null;

/** True if a save exists in localStorage (the Title screen shows "Continue"). */
export function hasSave(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** The save in memory. Loads it from localStorage the first time. */
export function getSave(): SaveFile {
  if (!current) current = loadSave();
  return current;
}

/** Start over: replace the save with a fresh one (and write it). */
export function newGame(): SaveFile {
  current = freshSave();
  saveGame();
  return current;
}

/** Write the in-memory save to localStorage. Cheap: call it whenever something important changes. */
export function saveGame(): void {
  if (!current) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Private mode / storage full: the game still works, it just won't remember.
  }
}

function loadSave(): SaveFile {
  const fresh = freshSave();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const data = JSON.parse(raw) as Partial<SaveFile>;
    if (data.version !== SAVE_VERSION) return fresh;
    // Merge over a fresh save so heroes/fields added in later versions get defaults.
    return {
      ...fresh,
      ...data,
      heroes: { ...fresh.heroes, ...data.heroes },
      potions: { ...fresh.potions, ...data.potions },
      stages: { ...data.stages },
      settings: { ...fresh.settings, ...data.settings },
    } as SaveFile;
  } catch {
    return fresh; // broken JSON: start fresh rather than crash
  }
}

// ---------------------------------------------------------------------------
// Small helpers used by several scenes
// ---------------------------------------------------------------------------

export function heroSave(id: string): HeroSave {
  const save = getSave();
  if (!save.heroes[id]) save.heroes[id] = { xp: 0, weapon: 0 };
  return save.heroes[id];
}

export function heroLevel(id: string): number {
  return levelFromXp(heroSave(id).xp).level;
}

/** Give XP to a hero. Returns how many levels it gained (0 if none). */
export function grantXp(id: string, amount: number): number {
  const h = heroSave(id);
  const before = levelFromXp(h.xp).level;
  // Stop counting XP at max level so the number doesn't grow forever.
  h.xp = Math.min(h.xp + amount, totalXpForLevel(MAX_LEVEL));
  return levelFromXp(h.xp).level - before;
}

export function stageSave(id: string): StageSave {
  const save = getSave();
  if (!save.stages[id]) save.stages[id] = { cleared: false, bestTime: 0, stars: [] };
  return save.stages[id];
}

/**
 * The party to play with. Always valid: only owned heroes, no duplicates,
 * 1 to MAX_PARTY of them (falls back to the first owned hero).
 */
export function getParty(): string[] {
  const save = getSave();
  const valid = save.party.filter((id, i) => save.roster.includes(id) && save.party.indexOf(id) === i && HEROES.some((h) => h.id === id));
  save.party = valid.length > 0 ? valid.slice(0, MAX_PARTY) : [save.roster[0]];
  return save.party;
}
