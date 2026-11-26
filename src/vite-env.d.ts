/// <reference types="vite/client" />

/** The environment variables the game reads (from .env locally, or Netlify's settings when deployed). */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
