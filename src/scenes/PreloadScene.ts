import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

/**
 * PreloadScene loads external files (images, sounds, JSON) and shows a loading bar.
 * Right now everything is generated in BootScene, so there is nothing to load.
 * When you add real assets, call this.load.image(...) etc. inside preload().
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const barW = 320;
    const x = (GAME_WIDTH - barW) / 2;
    const y = GAME_HEIGHT / 2;
    this.add.rectangle(x, y, barW, 10, 0x2a2236).setOrigin(0, 0.5);
    const bar = this.add.rectangle(x, y, 0, 10, 0xffcf5a).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => (bar.width = barW * p));

    // Example for later:
    // this.load.image('hero-rook', 'assets/heroes/rook.png');
  }

  create(): void {
    this.scene.start('Login'); // login / guest choice comes before the title screen
  }
}
