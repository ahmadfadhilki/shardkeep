import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { getAccount, isOnlineAvailable, logIn, playAsGuest, restoreSession, signUp } from '../services/saveService';
import { Sfx } from '../systems/Sfx';

/**
 * LoginScene: the first screen. Log in, sign up, or play as a guest.
 *
 * Phaser can't draw real text boxes, so the form is plain HTML placed on top
 * of the canvas with `this.add.dom()` (needs `dom: { createContainer: true }`
 * in main.ts). Phaser keeps it scaled and positioned with the game.
 *
 * If you're already logged in from last time, this screen skips itself.
 */
export class LoginScene extends Phaser.Scene {
  private mode: 'login' | 'signup' = 'login';
  private busy = false;
  private form!: Phaser.GameObjects.DOMElement;

  constructor() {
    super('Login');
  }

  async create(): Promise<void> {
    this.busy = false;
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.add.text(GAME_WIDTH / 2, 70, 'SHARDKEEP', { fontFamily: 'monospace', fontSize: '48px', fontStyle: 'bold', color: COLORS.uiAccent })
      .setOrigin(0.5).setShadow(3, 3, '#000000', 0, true, true);

    // Remembered login? Then go straight to the Title screen.
    const status = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, isOnlineAvailable() ? 'Checking login...' : '', {
      fontFamily: 'monospace', fontSize: '16px', color: COLORS.uiText,
    }).setOrigin(0.5);
    const notice = await restoreSession();
    if (!this.scene.isActive()) return;
    status.destroy();
    if (getAccount()) {
      this.goToTitle(notice ?? undefined);
      return;
    }
    this.buildForm();
  }

  private buildForm(): void {
    const online = isOnlineAvailable();
    // Plain HTML + inline styles. Each id is looked up below to read values / attach clicks.
    const html = `
      <form id="login" style="width:360px;font-family:monospace;color:#f4ecff;background:#1a1422ee;border:2px solid #ffcf5a;border-radius:12px;padding:18px 22px;box-sizing:border-box">
        ${online ? `
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button type="button" id="tab-login" style="${tabStyle(true)}">Log in</button>
          <button type="button" id="tab-signup" style="${tabStyle(false)}">Sign up</button>
        </div>
        <div id="name-row" style="display:none">
          <label style="${labelStyle}">Display name (shown on the leaderboard)</label>
          <input id="name" maxlength="16" autocomplete="nickname" style="${inputStyle}" placeholder="3-16 letters / numbers" />
        </div>
        <label style="${labelStyle}">Email</label>
        <input id="email" type="email" autocomplete="email" style="${inputStyle}" />
        <label style="${labelStyle}">Password</label>
        <input id="password" type="password" autocomplete="current-password" style="${inputStyle}" placeholder="at least 6 characters" />
        <button type="submit" id="submit" style="${buttonStyle('#ffcf5a')}">Log in</button>
        <div style="text-align:center;margin:10px 0 6px;opacity:.6;font-size:12px">or</div>
        ` : `<p style="font-size:13px;line-height:1.5;margin:0 0 12px">Online features (accounts, cloud save, leaderboard) are not set up in this build. You can still play: progress is saved in this browser.</p>`}
        <button type="button" id="guest" style="${buttonStyle('#c9bde0')}">Play as Guest</button>
        <div style="font-size:11px;opacity:.6;margin-top:6px;text-align:center">Guest progress stays in this browser only.</div>
        <div id="msg" style="min-height:34px;margin-top:10px;font-size:12px;line-height:1.4;text-align:center"></div>
      </form>`;
    this.form = this.add.dom(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40).createFromHTML(html);

    const el = (id: string) => this.form.getChildByID(id) as HTMLElement | null;
    el('guest')?.addEventListener('click', () => this.guest());
    if (!online) return;
    el('tab-login')?.addEventListener('click', () => this.setMode('login'));
    el('tab-signup')?.addEventListener('click', () => this.setMode('signup'));
    // Enter in any box (or the button) submits the form.
    el('login')?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
  }

  private setMode(mode: 'login' | 'signup'): void {
    this.mode = mode;
    Sfx.play('uiMove');
    const el = (id: string) => this.form.getChildByID(id) as HTMLElement;
    el('tab-login').setAttribute('style', tabStyle(mode === 'login'));
    el('tab-signup').setAttribute('style', tabStyle(mode === 'signup'));
    el('name-row').style.display = mode === 'signup' ? 'block' : 'none';
    el('submit').textContent = mode === 'signup' ? 'Create account' : 'Log in';
    (el('password') as HTMLInputElement).autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    this.say('');
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    const value = (id: string) => ((this.form.getChildByID(id) as HTMLInputElement | null)?.value ?? '').trim();
    const email = value('email');
    const password = (this.form.getChildByID('password') as HTMLInputElement).value;
    if (!email || !password) return this.say('Please enter your email and password.', true);

    this.busy = true;
    this.say(this.mode === 'signup' ? 'Creating your account...' : 'Logging in...');
    const result = this.mode === 'signup' ? await signUp(email, password, value('name')) : await logIn(email, password);
    this.busy = false;
    if (!this.scene.isActive()) return;

    if (!result.ok) return this.say(result.message, true);
    if (result.loggedIn) {
      Sfx.play('uiConfirm');
      this.goToTitle(result.message);
    } else {
      // Signed up, but the email must be confirmed first.
      this.say(result.message, false, true);
      this.setModeQuiet('login');
    }
  }

  private setModeQuiet(mode: 'login' | 'signup'): void {
    const msg = (this.form.getChildByID('msg') as HTMLElement).innerHTML;
    this.setMode(mode);
    (this.form.getChildByID('msg') as HTMLElement).innerHTML = msg;
  }

  private guest(): void {
    if (this.busy) return;
    Sfx.play('uiConfirm');
    playAsGuest();
    this.goToTitle();
  }

  private say(text: string, error = false, good = false): void {
    const msg = this.form?.getChildByID('msg') as HTMLElement | null;
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = error ? '#ff9b9b' : good ? '#b8f27a' : '#f4ecff';
    if (error) Sfx.play('uiError');
  }

  private goToTitle(notice?: string): void {
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title', { notice }));
  }
}

// --- Tiny inline style helpers (plain CSS strings) ---
const labelStyle = 'display:block;font-size:12px;margin:8px 0 4px;opacity:.85';
const inputStyle =
  'width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid #5a4a72;background:#120e18;color:#f4ecff;font:14px monospace;user-select:text;-webkit-user-select:text';
function buttonStyle(color: string): string {
  return `width:100%;margin-top:12px;padding:9px;border:0;border-radius:6px;background:${color};color:#1a1422;font:bold 14px monospace;cursor:pointer`;
}
function tabStyle(active: boolean): string {
  return `flex:1;padding:7px;border-radius:6px;border:1px solid #ffcf5a;cursor:pointer;font:bold 13px monospace;background:${active ? '#ffcf5a' : 'transparent'};color:${active ? '#1a1422' : '#ffcf5a'}`;
}
