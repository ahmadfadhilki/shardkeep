import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

/**
 * CONTROL SETTINGS: which key does what (laptop), and where the touch
 * buttons sit (phone). Changed on the Controls screen.
 *
 * Stored in localStorage on THIS device only (not in the cloud save), because
 * a phone layout makes no sense on a laptop and vice versa.
 */

const STORAGE_KEY = 'shardkeep-controls';

// ---------------------------------------------------------------------------
// Keyboard / mouse bindings
// ---------------------------------------------------------------------------

/** Every action that can be rebound. */
export type ActionId = 'up' | 'down' | 'left' | 'right' | 'attack' | 'skill' | 'dodge' | 'chain' | 'swap' | 'potionHp' | 'potionMp';

/** Order and names shown on the Controls screen. */
export const ACTIONS: { id: ActionId; label: string }[] = [
  { id: 'up', label: 'Move up' },
  { id: 'down', label: 'Move down' },
  { id: 'left', label: 'Move left' },
  { id: 'right', label: 'Move right' },
  { id: 'attack', label: 'Attack (hold = combo)' },
  { id: 'skill', label: 'Weapon skill' },
  { id: 'dodge', label: 'Dodge roll' },
  { id: 'chain', label: 'Chain skill' },
  { id: 'swap', label: 'Switch hero' },
  { id: 'potionHp', label: 'Health potion' },
  { id: 'potionMp', label: 'Mana potion' },
];

/**
 * A binding is a Phaser key name ('E', 'SPACE', 'SHIFT'...) or a mouse button:
 * 'MOUSE_LEFT', 'MOUSE_RIGHT', 'MOUSE_MIDDLE'.
 */
export const DEFAULT_BINDINGS: Record<ActionId, string> = {
  up: 'W',
  down: 'S',
  left: 'A',
  right: 'D',
  attack: 'MOUSE_LEFT',
  skill: 'E',
  dodge: 'MOUSE_RIGHT',
  chain: 'F',
  swap: 'Q',
  potionHp: 'Z',
  potionMp: 'X',
};

/**
 * Keys with a fixed job that can't be rebound:
 * arrows always move, 1/2/3 pick a hero, R resets the room, Esc opens the menu, M mutes.
 */
export const RESERVED_KEYS = ['ESC', 'ONE', 'TWO', 'THREE', 'R', 'M', 'UP', 'DOWN', 'LEFT', 'RIGHT'];

export const MOUSE_BUTTONS = ['MOUSE_LEFT', 'MOUSE_MIDDLE', 'MOUSE_RIGHT'] as const;

/** Short text for a binding, for the HUD and the Controls screen. */
export function bindingLabel(binding: string): string {
  const names: Record<string, string> = {
    MOUSE_LEFT: 'L-Click',
    MOUSE_RIGHT: 'R-Click',
    MOUSE_MIDDLE: 'M-Click',
    SPACE: 'Space',
    SHIFT: 'Shift',
    CTRL: 'Ctrl',
    ALT: 'Alt',
    TAB: 'Tab',
    ENTER: 'Enter',
    BACKSPACE: 'Bksp',
    CAPS_LOCK: 'Caps',
    COMMA: ',',
    PERIOD: '.',
    FORWARD_SLASH: '/',
    SEMICOLON: ';',
    QUOTES: "'",
    OPEN_BRACKET: '[',
    CLOSED_BRACKET: ']',
    BACK_SLASH: '\\',
    MINUS: '-',
    PLUS: '=',
    BACKTICK: '`',
    ZERO: '0', FOUR: '4', FIVE: '5', SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9',
  };
  return names[binding] ?? binding;
}

/** Phaser key name for a browser keyboard event (e.g. 69 -> 'E'), or null if Phaser doesn't know it. */
export function keyNameFromEvent(e: KeyboardEvent): string | null {
  const codes = Phaser.Input.Keyboard.KeyCodes as unknown as Record<string, number>;
  for (const [name, code] of Object.entries(codes)) if (code === e.keyCode) return name;
  return null;
}

// ---------------------------------------------------------------------------
// Touch layout
// ---------------------------------------------------------------------------

export type TouchButtonId = 'attack' | 'skill' | 'dodge' | 'chain' | 'swap' | 'potionHp' | 'potionMp' | 'pause';

/** Look of each touch button. Positions/sizes live in the settings (the player can move them). */
export const TOUCH_BUTTONS: { id: TouchButtonId; label: string; color: number; r: number }[] = [
  { id: 'attack', label: 'ATK', color: 0xffffff, r: 52 },
  { id: 'skill', label: 'SKILL', color: 0xffb347, r: 38 },
  { id: 'dodge', label: 'ROLL', color: 0x9fd8ff, r: 34 },
  { id: 'chain', label: 'CHAIN', color: 0xff7af0, r: 36 },
  { id: 'swap', label: 'SWAP', color: 0xc9bde0, r: 26 },
  { id: 'potionHp', label: 'HP', color: 0xff5a7a, r: 24 },
  { id: 'potionMp', label: 'MP', color: 0x5a9aff, r: 24 },
  { id: 'pause', label: 'II', color: 0xffffff, r: 22 },
];

export interface TouchButtonLayout {
  x: number;
  y: number;
  /** Size multiplier (0.6 - 1.6). */
  scale: number;
}

/**
 * floating: the stick appears wherever your thumb lands on the left side.
 * fixed:    the stick always sits in one place (drag it there on the Controls screen).
 */
export type StickMode = 'floating' | 'fixed';

export interface TouchLayout {
  stickMode: StickMode;
  stick: { x: number; y: number; scale: number };
  /** How see-through the buttons are (0.2 - 0.9). */
  opacity: number;
  buttons: Record<TouchButtonId, TouchButtonLayout>;
}

export function defaultTouchLayout(): TouchLayout {
  const W = GAME_WIDTH;
  const H = GAME_HEIGHT;
  return {
    stickMode: 'floating',
    stick: { x: 120, y: H - 110, scale: 1 },
    opacity: 0.4,
    buttons: {
      attack: { x: W - 92, y: H - 92, scale: 1 },
      skill: { x: W - 200, y: H - 62, scale: 1 },
      dodge: { x: W - 74, y: H - 210, scale: 1 },
      chain: { x: W - 196, y: H - 176, scale: 1 },
      swap: { x: W - 300, y: H - 40, scale: 1 },
      potionHp: { x: W - 372, y: H - 40, scale: 1 },
      potionMp: { x: W - 436, y: H - 40, scale: 1 },
      pause: { x: W - 28, y: 28, scale: 1 },
    },
  };
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

export interface ControlSettings {
  bindings: Record<ActionId, string>;
  touch: TouchLayout;
}

let current: ControlSettings | null = null;

export function getControlSettings(): ControlSettings {
  if (current) return current;
  const fresh: ControlSettings = { bindings: { ...DEFAULT_BINDINGS }, touch: defaultTouchLayout() };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<ControlSettings> | null;
    if (saved) {
      // Merge over the defaults so actions/buttons added later get a value.
      fresh.bindings = { ...fresh.bindings, ...saved.bindings };
      fresh.touch = {
        ...fresh.touch,
        ...saved.touch,
        stick: { ...fresh.touch.stick, ...saved.touch?.stick },
        buttons: { ...fresh.touch.buttons, ...saved.touch?.buttons },
      };
    }
  } catch {
    // broken settings: use the defaults
  }
  current = fresh;
  return current;
}

/**
 * Save the settings and tell the running scenes (they rebuild their keys / buttons).
 * Listen with:  game.events.on(CONTROLS_CHANGED, ...)
 */
export const CONTROLS_CHANGED = 'controls-changed';

export function saveControlSettings(game: Phaser.Game): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getControlSettings()));
  } catch {
    // storage blocked: the change still works until the page is closed
  }
  game.events.emit(CONTROLS_CHANGED);
}

export function resetBindings(): void {
  getControlSettings().bindings = { ...DEFAULT_BINDINGS };
}

export function resetTouchLayout(): void {
  getControlSettings().touch = defaultTouchLayout();
}
