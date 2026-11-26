import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * THE SUPABASE CLIENT (one for the whole game)
 * --------------------------------------------
 * The URL and key come from the .env file (see .env.example). Vite only
 * exposes variables that start with VITE_, and it bakes them into the
 * game's JavaScript at build time. That means ANYONE can read them, which
 * is fine for the publishable/anon key: Row Level Security in the database
 * (supabase/schema.sql) is what keeps each player's data safe.
 *
 * NEVER put the service_role / secret key here: it skips all security rules.
 *
 * If the values are missing (for example a fresh clone without a .env),
 * `supabase` is null and the game simply runs in guest-only mode.
 */

/**
 * supabase-js wants the project's base address (https://<project>.supabase.co).
 * People often paste the REST address from the dashboard instead
 * (…supabase.co/rest/v1/), so we trim that off to be forgiving.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') || undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || undefined;

/** Safety net: refuse to run with a secret key, even if someone pastes one in by mistake. */
function looksSecret(k: string): boolean {
  if (k.startsWith('sb_secret_')) return true;
  try {
    // Old-style keys are JWTs: the middle part is base64 JSON with a "role".
    const payload = JSON.parse(atob(k.split('.')[1] ?? ''));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

function makeClient(): SupabaseClient | null {
  if (!url || !key) {
    console.info('[Shardkeep] No Supabase settings found: playing in guest-only mode.');
    return null;
  }
  if (looksSecret(key)) {
    console.error('[Shardkeep] VITE_SUPABASE_ANON_KEY is a SECRET (service_role) key! Use the publishable/anon key. Online features are disabled.');
    return null;
  }
  return createClient(url, key, {
    auth: {
      persistSession: true, // stay logged in after closing the browser
      autoRefreshToken: true,
      storageKey: 'shardkeep-auth',
    },
  });
}

export const supabase: SupabaseClient | null = makeClient();

/** True when online features (accounts, cloud save, leaderboard) can be used at all. */
export const isCloudConfigured = supabase !== null;
