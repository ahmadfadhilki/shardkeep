import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TitleScene } from './scenes/TitleScene';
import { StageScene } from './scenes/StageScene';
import { UIScene } from './scenes/UIScene';
import { HubScene } from './scenes/HubScene';
import { StageSelectScene } from './scenes/StageSelectScene';
import { ResultsScene } from './scenes/ResultsScene';
import { PauseScene } from './scenes/PauseScene';
import { LoginScene } from './scenes/LoginScene';
import { LeaderboardScene } from './scenes/LeaderboardScene';
import { initSfx, toggleMute } from './systems/Sfx';

/**
 * Entry point. Creates the Phaser game and registers all scenes.
 * The first scene in the list (Boot) starts automatically.
 *
 * Tip: open the game with ?debug in the URL (http://localhost:5173/?debug)
 * to see physics bodies drawn as outlines.
 */
const debug = new URLSearchParams(window.location.search).has('debug');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.background,
  pixelArt: true, // crisp pixels, no blurry smoothing
  scale: {
    mode: Phaser.Scale.FIT, // scale to the window but keep the aspect ratio
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Lets scenes place real HTML (the login form's text boxes) on top of the canvas.
  dom: { createContainer: true },
  // Several fingers at once on phones: joystick + attack + skill.
  input: { activePointers: 4 },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug }, // top-down = no gravity
  },
  // Flow: Login -> Title -> Hub -> StageSelect -> Stage (+ UI overlay) -> Results -> Hub
  scene: [BootScene, PreloadScene, LoginScene, TitleScene, HubScene, StageSelectScene, StageScene, UIScene, PauseScene, ResultsScene, LeaderboardScene],
});

// Expose the game in the browser console for learning/debugging: try `game.scene.getScenes(true)`.
(window as unknown as { game: Phaser.Game }).game = game;

// Sound effects are generated with Web Audio (see systems/Sfx.ts).
// We reuse the audio context Phaser already created (it handles browser "unlocking").
game.events.once(Phaser.Core.Events.READY, () => {
  const sound = game.sound as Phaser.Sound.WebAudioSoundManager;
  initSfx(sound.context);
});

// M mutes / unmutes sound from anywhere. The setting is saved.
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return; // typing an "m" in the login form isn't a shortcut
  if (e.key === 'm' || e.key === 'M') toggleMute();
});
