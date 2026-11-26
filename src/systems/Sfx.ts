import { getSave, saveGame } from './SaveData';

/**
 * PLACEHOLDER SOUND EFFECTS, made from code (no audio files!).
 *
 * The Web Audio API can generate sound with "oscillators" (beeps in a
 * waveform: sine, square, sawtooth, triangle) and white noise (for hits and
 * explosions). Each effect below is a few lines that shape a beep or a noise
 * burst over time. Later you can swap them for real recordings.
 *
 * Usage anywhere:   Sfx.play('coin');
 * Mute: M key (anywhere), or the pause menu. The setting is saved.
 */

export type SfxName =
  | 'swing' | 'shoot' | 'hit' | 'hitHeavy' | 'hurt' | 'dodge' | 'skill' | 'heal' | 'chain'
  | 'enemyDie' | 'explosion' | 'roar' | 'coin' | 'star' | 'key' | 'door' | 'levelUp' | 'potion'
  | 'uiMove' | 'uiConfirm' | 'uiBack' | 'uiError' | 'buy' | 'blip' | 'clear' | 'defeat';

/** Same sound can't play more often than this (ms). Stops 10 hits in one frame from being deafening. */
const MIN_GAP = 35;
const MASTER_VOLUME = 0.35;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
const lastPlayed: Partial<Record<SfxName, number>> = {};

/** Give the sound system the browser's audio context (Phaser creates one for us). */
export function initSfx(context: AudioContext | undefined): void {
  if (!context || ctx) return;
  ctx = context;
  master = ctx.createGain();
  master.gain.value = MASTER_VOLUME;
  master.connect(ctx.destination);
  // One second of random samples = white noise, reused by every noisy sound.
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

export function isMuted(): boolean {
  return getSave().settings.muted;
}

export function toggleMute(): boolean {
  const s = getSave();
  s.settings.muted = !s.settings.muted;
  saveGame();
  return s.settings.muted;
}

/** A beep that can slide from one pitch to another. */
function tone(freq: number, duration: number, type: OscillatorType, volume: number, slideTo?: number, delay = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  // Quick fade in, then fade out: avoids clicks.
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** A burst of filtered noise: low cutoff = thud, high cutoff = hiss. */
function noise(duration: number, volume: number, cutoff: number, delay = 0): void {
  if (!ctx || !master || !noiseBuffer) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(gain).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + duration + 0.02);
}

/** Notes as frequencies (Hz) for the little jingles. */
const C5 = 523, E5 = 659, G5 = 784, C6 = 1047;

const SOUNDS: Record<SfxName, () => void> = {
  swing: () => noise(0.08, 0.25, 2400),
  shoot: () => tone(900, 0.08, 'triangle', 0.15, 500),
  hit: () => { noise(0.06, 0.35, 1600); tone(180, 0.06, 'square', 0.12, 90); },
  hitHeavy: () => { noise(0.14, 0.5, 900); tone(140, 0.14, 'square', 0.18, 50); },
  hurt: () => tone(300, 0.18, 'sawtooth', 0.18, 120),
  dodge: () => noise(0.12, 0.15, 4000),
  skill: () => { tone(400, 0.18, 'triangle', 0.18, 900); noise(0.15, 0.15, 3000); },
  heal: () => { tone(660, 0.12, 'sine', 0.15, 880); tone(880, 0.16, 'sine', 0.12, 1100, 0.08); },
  chain: () => { tone(220, 0.25, 'sawtooth', 0.15, 880); noise(0.2, 0.35, 1400, 0.1); },
  enemyDie: () => { tone(500, 0.2, 'square', 0.12, 80); noise(0.15, 0.2, 1200); },
  explosion: () => { noise(0.8, 0.6, 600); tone(90, 0.8, 'sawtooth', 0.2, 30); },
  roar: () => { tone(110, 0.9, 'sawtooth', 0.25, 70); noise(0.9, 0.3, 500); },
  coin: () => { tone(988, 0.06, 'square', 0.1); tone(1319, 0.12, 'square', 0.1, undefined, 0.05); },
  star: () => [C5, E5, G5, C6].forEach((f, i) => tone(f, 0.18, 'triangle', 0.15, undefined, i * 0.07)),
  key: () => { tone(784, 0.1, 'triangle', 0.15); tone(1175, 0.2, 'triangle', 0.15, undefined, 0.08); },
  door: () => { noise(0.4, 0.3, 300); tone(120, 0.4, 'triangle', 0.15, 80); },
  levelUp: () => [C5, E5, G5, C6, G5, C6].forEach((f, i) => tone(f, 0.14, 'square', 0.09, undefined, i * 0.07)),
  potion: () => { tone(300, 0.25, 'sine', 0.15, 700); tone(500, 0.1, 'sine', 0.08, 900, 0.1); },
  uiMove: () => tone(660, 0.04, 'square', 0.06),
  uiConfirm: () => { tone(784, 0.06, 'square', 0.08); tone(1047, 0.08, 'square', 0.08, undefined, 0.05); },
  uiBack: () => tone(500, 0.08, 'square', 0.07, 300),
  uiError: () => tone(160, 0.18, 'square', 0.1),
  buy: () => { tone(1319, 0.08, 'square', 0.08); tone(1760, 0.15, 'square', 0.08, undefined, 0.06); },
  blip: () => tone(520 + Math.random() * 80, 0.03, 'square', 0.04),
  clear: () => [C5, E5, G5, C6].forEach((f, i) => tone(f, i === 3 ? 0.5 : 0.15, 'triangle', 0.18, undefined, i * 0.12)),
  defeat: () => [G5, E5, C5, 392].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, undefined, i * 0.18)),
};

export const Sfx = {
  play(name: SfxName): void {
    if (!ctx || isMuted()) return;
    if (ctx.state === 'suspended') void ctx.resume(); // browsers start audio "asleep" until a click/key
    const now = performance.now();
    if (now - (lastPlayed[name] ?? 0) < MIN_GAP) return;
    lastPlayed[name] = now;
    SOUNDS[name]();
  },
};
