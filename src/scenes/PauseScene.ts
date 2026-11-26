import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, IS_TOUCH } from '../config';
import { isMuted, Sfx, toggleMute } from '../systems/Sfx';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Button, FONT, type PanelKey } from '../ui/Panel';
import type { StageScene } from './StageScene';
import { getAccount, isOnlineAvailable, logOut } from '../services/saveService';
import type { ControlsSceneData } from './ControlsScene';

export interface PauseData {
  /** Which scene is paused underneath: a stage (with its UI) or the town. */
  from?: 'Stage' | 'Hub';
  stageId?: string;
}

/**
 * PauseScene: the menu (Esc, or the II / Menu button). It sits on top of the
 * paused scene(s) (scene.pause freezes their update loop, tweens and timers).
 *
 * In a stage:                         In town:
 *   Resume                              Resume
 *   Reset room (if stuck)               Controls
 *   Restart stage   (asks first)        Log out / Log in
 *   Return to town  (asks first)        Quit to title
 *   Controls                            Sound
 *   Log out         (logged in only)
 *   Sound: On/Off   (M works anywhere too)
 */
export class PauseScene extends Phaser.Scene {
  private stageId = '';
  private from: 'Stage' | 'Hub' = 'Stage';
  private buttons: Button[] = [];
  private selected = 0;
  private confirm!: ConfirmDialog;
  private soundButton!: Button;

  constructor() {
    super('Pause');
  }

  init(data: PauseData): void {
    this.from = data.from ?? 'Stage';
    this.stageId = data.stageId ?? '';
    this.buttons = [];
    this.selected = 0;
  }

  create(): void {
    this.input.setDefaultCursor('default'); // the stage hides the cursor; menus need it
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0710, 0.7);
    this.add.text(GAME_WIDTH / 2, 100, 'PAUSED', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: COLORS.uiAccent }).setOrigin(0.5);

    const inStage = this.from === 'Stage';
    const warn = inStage ? 'Coins picked up in this run will be lost.\n(XP you earned is already saved.)' : 'Your progress is saved.';
    const options: [string, () => void][] = [['Resume', () => this.resume()]];
    if (inStage) {
      options.push(
        ['Reset room (if stuck)', () => this.resetRoom()],
        ['Restart stage', () => this.confirm.ask(`Restart the stage?\n${warn}`, () => this.restart())],
        ['Return to town', () => this.confirm.ask(`Return to town?\n${warn}`, () => this.quit())],
      );
    }
    options.push(['Controls', () => this.openControls()]);
    if (getAccount()) {
      options.push(['Log out', () => this.confirm.ask(`Log out of ${getAccount()!.displayName}?\n${warn}`, () => void this.logout())]);
    } else if (!inStage && isOnlineAvailable()) {
      options.push(['Log in / Sign up', () => this.leaveTo('Login')]);
    }
    if (!inStage) options.push(['Quit to title', () => this.leaveTo('Title')]);
    options.push([this.soundLabel(), () => this.toggleSound()]); // Sound stays last
    options.forEach(([label, action], i) => {
      const b = new Button(this, GAME_WIDTH / 2, 160 + i * 44, label, () => { Sfx.play('uiConfirm'); action(); }, 260, 38);
      b.on('pointerover', () => this.focus(i));
      this.buttons.push(b);
    });
    this.soundButton = this.buttons[this.buttons.length - 1];
    if (!IS_TOUCH) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'W/S: choose    E/Enter: select    Esc: resume', { fontFamily: FONT, fontSize: '12px', color: COLORS.uiText })
        .setOrigin(0.5).setAlpha(0.7);
    }
    this.confirm = new ConfirmDialog(this);
    this.focus(0);

    const kb = this.input.keyboard!;
    const press = (k: PanelKey) => this.onKey(k);
    kb.on('keydown-W', () => press('up'));
    kb.on('keydown-UP', () => press('up'));
    kb.on('keydown-S', () => press('down'));
    kb.on('keydown-DOWN', () => press('down'));
    kb.on('keydown-A', () => press('left'));
    kb.on('keydown-LEFT', () => press('left'));
    kb.on('keydown-D', () => press('right'));
    kb.on('keydown-RIGHT', () => press('right'));
    kb.on('keydown-E', () => press('confirm'));
    kb.on('keydown-ENTER', () => press('confirm'));
    kb.on('keydown-SPACE', () => press('confirm'));
    kb.on('keydown-ESC', () => press('back'));
    // M is handled globally (main.ts); just refresh the label when it changes.
    kb.on('keydown-M', () => this.time.delayedCall(10, () => this.soundButton.setText(this.soundLabel())));
  }

  private onKey(key: PanelKey): void {
    if (this.confirm.isOpen) return this.confirm.handleKey(key);
    if (key === 'up') this.focus(this.selected - 1, true);
    else if (key === 'down') this.focus(this.selected + 1, true);
    else if (key === 'confirm') this.buttons[this.selected].press();
    else if (key === 'back') this.resume();
  }

  private focus(i: number, withSound = false): void {
    this.selected = Phaser.Math.Wrap(i, 0, this.buttons.length);
    this.buttons.forEach((b, j) => b.setHighlight(j === this.selected));
    if (withSound) Sfx.play('uiMove');
  }

  private resume(): void {
    if (this.from === 'Stage') {
      this.input.setDefaultCursor(IS_TOUCH ? 'default' : 'none');
      this.scene.resume('UI');
      this.scene.resume('Stage');
    } else {
      this.scene.resume('Hub');
    }
    this.scene.stop();
  }

  /** Controls screen on top; this menu sleeps until it closes (it wakes us up). */
  private openControls(): void {
    this.scene.sleep();
    this.scene.launch('Controls', { from: 'Pause' } satisfies ControlsSceneData);
  }

  /** From town: close the town and go to another screen. */
  private leaveTo(scene: 'Login' | 'Title'): void {
    this.scene.stop('Hub');
    this.scene.start(scene);
  }

  /** Same as R on a keyboard: re-enter this room (puts push blocks back). */
  private resetRoom(): void {
    this.resume();
    (this.scene.get('Stage') as StageScene).resetRoom();
  }

  private restart(): void {
    this.scene.stop('UI');
    this.scene.start('Stage', { stageId: this.stageId }); // a brand-new run (start also stops this scene)
  }

  private quit(): void {
    this.scene.stop('UI');
    this.scene.stop('Stage');
    this.scene.start('Hub');
  }

  /** Upload the save, sign out, and go back to the login screen. */
  private async logout(): Promise<void> {
    if (this.from === 'Stage') {
      this.scene.stop('UI');
      this.scene.stop('Stage');
    } else {
      this.scene.stop('Hub');
    }
    await logOut();
    this.scene.start('Login');
  }

  private soundLabel(): string {
    return `Sound: ${isMuted() ? 'Off' : 'On'}${IS_TOUCH ? '' : '  (M)'}`;
  }

  private toggleSound(): void {
    toggleMute();
    this.soundButton.setText(this.soundLabel());
  }
}
