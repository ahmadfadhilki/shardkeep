import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { GUEST_SLOT, readSlot, replaceSave, setSaveListener, useSaveSlot, getSave, type SaveFile } from '../systems/SaveData';

/**
 * SAVE SERVICE: accounts, cloud saves and the leaderboard.
 * -------------------------------------------------------
 * Every call to Supabase lives in this file (plus the client in supabase.ts),
 * so the rest of the game never has to think about the internet.
 *
 * The big idea: localStorage is ALWAYS the first place we save.
 *   - Guests:            only localStorage ('shardkeep-save').
 *   - Logged-in players: localStorage ('shardkeep-save-<id>') + a copy in the
 *                        cloud ('saves' table), uploaded a few seconds later.
 * If the internet is down, the upload is remembered as "pending" and retried
 * later (next save, or when the browser says we're back online). The game
 * never waits for the network to keep playing.
 */

export interface Account {
  id: string;
  email: string;
  displayName: string;
}

/** Result of login / sign-up, shown to the player. */
export interface AuthResult {
  ok: boolean;
  /** Logged in right away? (false when the email still needs confirming) */
  loggedIn: boolean;
  message: string;
}

export interface LeaderRow {
  rank: number;
  name: string;
  time: number;
  isMe: boolean;
}

/** Wait at most this long for Supabase before treating it as "offline". */
const NETWORK_TIMEOUT_MS = 8000;
/** Upload the save this long after the last change (many saves in a row = one upload). */
const UPLOAD_DELAY_MS = 4000;
/** Remembers which email just signed up as a guest, so their guest save is uploaded on first login. */
const GUEST_UPLOAD_KEY = 'shardkeep-upload-guest-for';
const DISPLAY_NAME_RULE = /^[A-Za-z0-9_ -]{3,16}$/;

let account: Account | null = null;
let uploadTimer: ReturnType<typeof setTimeout> | null = null;

const pendingSaveKey = (id: string) => `shardkeep-cloud-pending-${id}`;
const pendingTimesKey = (id: string) => `shardkeep-pending-times-${id}`;
const accountSlot = (id: string) => `shardkeep-save-${id}`;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Reject if a network call takes too long (no internet often means "hangs", not "fails"). */
function withTimeout<T>(promise: PromiseLike<T>, ms = NETWORK_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function storageGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage blocked: ignore */ }
}

/** Turn Supabase's error messages into friendlier ones. */
function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first (check your inbox).';
  if (/already registered|already been registered/i.test(message)) return 'That email already has an account. Try logging in.';
  if (/password/i.test(message) && /6/.test(message)) return 'Password must be at least 6 characters.';
  if (/timeout|fetch|network/i.test(message)) return "Can't reach the server. Check your internet, or play as a guest.";
  return message;
}

// ---------------------------------------------------------------------------
// Who is playing?
// ---------------------------------------------------------------------------

export function isOnlineAvailable(): boolean {
  return supabase !== null;
}

export function getAccount(): Account | null {
  return account;
}

/** Guests keep using the normal localStorage save. */
export function playAsGuest(): void {
  account = null;
  useSaveSlot(GUEST_SLOT);
}

/**
 * At startup: is there a remembered login? (Supabase keeps it in localStorage,
 * so this works even offline.) If yes, we load that player's save.
 */
export async function restoreSession(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return await enterAccount(data.session.user);
  } catch {
    return null;
  }
}

export async function signUp(email: string, password: string, displayName: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, loggedIn: false, message: 'Online features are not set up.' };
  const name = displayName.trim();
  if (!DISPLAY_NAME_RULE.test(name)) {
    return { ok: false, loggedIn: false, message: 'Display name: 3-16 letters, numbers, spaces, _ or -.' };
  }
  try {
    // Is the name free? (profiles are public, so we can just look.)
    const { data: taken } = await withTimeout(supabase.from('profiles').select('id').eq('display_name', name).limit(1));
    if (taken && taken.length > 0) return { ok: false, loggedIn: false, message: 'That display name is taken. Try another.' };

    // The display name travels with the sign-up; a database trigger creates the profile.
    const { data, error } = await withTimeout(
      supabase.auth.signUp({ email, password, options: { data: { display_name: name } } }),
    );
    if (error) return { ok: false, loggedIn: false, message: friendly(error.message) };

    // A guest who makes an account brings their progress along (uploaded on first login).
    if (readSlot(GUEST_SLOT)) storageSet(GUEST_UPLOAD_KEY, email.trim().toLowerCase());

    if (data.session && data.user) {
      const notice = await enterAccount(data.user);
      return { ok: true, loggedIn: true, message: notice ?? `Welcome, ${name}!` };
    }
    // Email confirmation is on (Supabase's default): no session until they click the link.
    return { ok: true, loggedIn: false, message: 'Account created! Check your email, click the link, then log in here.' };
  } catch (e) {
    return { ok: false, loggedIn: false, message: friendly(String((e as Error).message ?? e)) };
  }
}

export async function logIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, loggedIn: false, message: 'Online features are not set up.' };
  try {
    const { data, error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }));
    if (error || !data.user) return { ok: false, loggedIn: false, message: friendly(error?.message ?? 'Login failed.') };
    const notice = await enterAccount(data.user);
    return { ok: true, loggedIn: true, message: notice ?? `Welcome back, ${account?.displayName}!` };
  } catch (e) {
    return { ok: false, loggedIn: false, message: friendly(String((e as Error).message ?? e)) };
  }
}

/** Upload anything unsaved, then forget the login and go back to the guest save. */
export async function logOut(): Promise<void> {
  await flushCloudSave();
  if (supabase) {
    try {
      await withTimeout(supabase.auth.signOut());
    } catch {
      // Offline: at least forget the login on this device.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  }
  playAsGuest();
}

/**
 * Switch the game to this player: pick their local save slot, then compare it
 * with the cloud save and keep the NEWER one. Returns a message worth showing
 * (or null).
 */
async function enterAccount(user: User): Promise<string | null> {
  const email = (user.email ?? '').toLowerCase();
  account = {
    id: user.id,
    email,
    displayName: (user.user_metadata?.display_name as string | undefined) ?? 'Player',
  };
  useSaveSlot(accountSlot(user.id));
  const local = readSlot(accountSlot(user.id));
  let notice: string | null = null;

  try {
    // The real display name (the trigger may have changed it if it was taken).
    const { data: profile } = await withTimeout(supabase!.from('profiles').select('display_name').eq('id', user.id).maybeSingle());
    if (profile?.display_name) account.displayName = profile.display_name as string;

    const { data: row, error } = await withTimeout(
      supabase!.from('saves').select('data, updated_at').eq('user_id', user.id).maybeSingle(),
    );
    if (error) throw error;

    if (row) {
      const cloud = row.data as SaveFile;
      if (local && local.updatedAt > (cloud.updatedAt ?? 0)) {
        replaceSave(local); // played offline on this device since the last upload
        markPending(true);
        await flushCloudSave();
      } else {
        replaceSave(cloud);
      }
    } else if (storageGet(GUEST_UPLOAD_KEY) === email && readSlot(GUEST_SLOT)) {
      // First login after signing up as a guest: bring the guest progress along.
      replaceSave(readSlot(GUEST_SLOT));
      storageSet(GUEST_UPLOAD_KEY, null);
      markPending(true);
      await flushCloudSave();
      notice = 'Your guest progress was copied to your new account!';
    } else if (local) {
      replaceSave(local);
      markPending(true);
      await flushCloudSave();
    }
    // (No cloud save and nothing local = a brand-new player: the Title screen offers New Game.)
  } catch {
    // Offline: play with this device's copy; it will be uploaded when we're back online.
    if (local) replaceSave(local);
    notice = 'Offline: using the save on this device. It will sync when you are back online.';
  }
  return notice;
}

// ---------------------------------------------------------------------------
// Cloud save (upload)
// ---------------------------------------------------------------------------

function markPending(on: boolean): void {
  if (account) storageSet(pendingSaveKey(account.id), on ? '1' : null);
}

/**
 * Called by SaveData after EVERY save. We don't upload every time (XP saves on
 * every kill!): we wait a few seconds, so a burst of saves becomes one upload.
 */
function onLocalSave(): void {
  if (!account || !supabase) return;
  markPending(true);
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => void flushCloudSave(), UPLOAD_DELAY_MS);
}

/**
 * Upload the save NOW if it has unsent changes. Used after clearing a stage,
 * after buying in the shop, before logging out, and when coming back online.
 * Returns true if the cloud is up to date.
 */
export async function flushCloudSave(): Promise<boolean> {
  if (uploadTimer) {
    clearTimeout(uploadTimer);
    uploadTimer = null;
  }
  if (!account || !supabase) return false;
  const id = account.id;
  if (storageGet(pendingSaveKey(id)) !== '1') return true;

  const save = getSave();
  try {
    const { error } = await withTimeout(
      supabase.from('saves').upsert({ user_id: id, data: save, updated_at: new Date(save.updatedAt || Date.now()).toISOString() }),
    );
    if (error) throw error;
    if (account?.id === id) markPending(false);
    await retryPendingTimes();
    return true;
  } catch {
    return false; // still pending: we'll try again later
  }
}

// Hook into the game's saves, and retry when the internet comes back.
setSaveListener(onLocalSave);
window.addEventListener('online', () => void flushCloudSave());

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export type SubmitResult = 'posted' | 'guest' | 'offline';

/**
 * Send a clear time. The database keeps only each player's best time
 * (see submit_time in schema.sql). Offline times are remembered and sent later.
 */
export async function submitBestTime(stageId: string, seconds: number): Promise<SubmitResult> {
  if (!account || !supabase) return 'guest';
  const time = Math.round(seconds * 100) / 100;
  try {
    const { error } = await withTimeout(supabase.rpc('submit_time', { p_stage_id: stageId, p_time: time }));
    if (error) throw error;
    return 'posted';
  } catch {
    // Keep the best offline time per stage; retried after the next successful upload.
    const pending = JSON.parse(storageGet(pendingTimesKey(account.id)) ?? '{}') as Record<string, number>;
    pending[stageId] = Math.min(pending[stageId] ?? Infinity, time);
    storageSet(pendingTimesKey(account.id), JSON.stringify(pending));
    return 'offline';
  }
}

async function retryPendingTimes(): Promise<void> {
  if (!account || !supabase) return;
  const key = pendingTimesKey(account.id);
  const pending = JSON.parse(storageGet(key) ?? '{}') as Record<string, number>;
  for (const [stageId, time] of Object.entries(pending)) {
    try {
      const { error } = await withTimeout(supabase.rpc('submit_time', { p_stage_id: stageId, p_time: time }));
      if (!error) delete pending[stageId];
    } catch {
      break;
    }
  }
  storageSet(key, Object.keys(pending).length ? JSON.stringify(pending) : null);
}

/**
 * Top 10 for a stage, fastest first, plus your own best time.
 * Returns null when the server can't be reached.
 */
export async function fetchLeaderboard(stageId: string): Promise<{ top: LeaderRow[]; myBest: number | null } | null> {
  if (!supabase) return null;
  try {
    // "profiles(display_name)" asks Supabase to join the player's public name. No emails anywhere.
    const { data, error } = await withTimeout(
      supabase
        .from('leaderboard')
        .select('user_id, time_seconds, profiles(display_name)')
        .eq('stage_id', stageId)
        .order('time_seconds', { ascending: true })
        .order('updated_at', { ascending: true }) // ties: whoever got it first
        .limit(10),
    );
    if (error) throw error;
    const top: LeaderRow[] = (data ?? []).map((row, i) => {
      const profile = row.profiles as { display_name: string } | { display_name: string }[] | null;
      const name = Array.isArray(profile) ? profile[0]?.display_name : profile?.display_name;
      return { rank: i + 1, name: name ?? '???', time: Number(row.time_seconds), isMe: row.user_id === account?.id };
    });

    let myBest: number | null = null;
    if (account) {
      const { data: mine } = await withTimeout(
        supabase.from('leaderboard').select('time_seconds').eq('stage_id', stageId).eq('user_id', account.id).maybeSingle(),
      );
      myBest = mine ? Number(mine.time_seconds) : null;
    }
    return { top, myBest };
  } catch {
    return null;
  }
}
