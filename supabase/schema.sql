-- =============================================================================
-- SHARDKEEP DATABASE (Supabase / PostgreSQL)
-- =============================================================================
-- Run this whole file ONCE in the Supabase dashboard: SQL Editor -> New query
-- -> paste -> Run. It is safe to run again (it uses "if not exists" / "or replace").
--
-- Tables:
--   profiles    - one row per player: their public display name (never the email)
--   saves       - one row per player: the whole save file as JSON
--   leaderboard - one row per player per stage: their BEST clear time
--
-- Row Level Security (RLS) is ON for every table. With RLS on, a table is
-- locked by default and only the "policies" below open specific doors.
-- auth.uid() = the id of the player who sent the request (null for guests).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. PROFILES: public display names
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null unique
               check (char_length(display_name) between 3 and 16
                      and display_name ~ '^[A-Za-z0-9_ -]+$'),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Everyone may READ display names (the leaderboard needs them). No emails are stored here.
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public"
  on public.profiles for select
  using (true);

-- A player may only change THEIR OWN display name.
drop policy if exists "players update own profile" on public.profiles;
create policy "players update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Profiles are created automatically when someone signs up (trigger below),
-- so there is no insert policy: players can't create extra profiles.

-- When a new user signs up, create their profile from the display name the
-- game sent along with the sign-up. "security definer" lets this function
-- write to profiles even though players themselves can't insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  wanted text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Player');
  final  text := wanted;
begin
  -- If the name is invalid or already taken, fall back to "Name_1a2b" so sign-up never fails.
  if char_length(final) < 3 or char_length(final) > 16 or final !~ '^[A-Za-z0-9_ -]+$' then
    final := 'Player';
  end if;
  if exists (select 1 from public.profiles where display_name = final) or final = 'Player' then
    final := left(final, 11) || '_' || left(replace(new.id::text, '-', ''), 4);
  end if;
  insert into public.profiles (id, display_name) values (new.id, final);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 2. SAVES: each player's save file (private)
-- -----------------------------------------------------------------------------
create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

-- Players can only see, create and change THEIR OWN save. Nobody else's.
drop policy if exists "players read own save" on public.saves;
create policy "players read own save"
  on public.saves for select
  using (auth.uid() = user_id);

drop policy if exists "players insert own save" on public.saves;
create policy "players insert own save"
  on public.saves for insert
  with check (auth.uid() = user_id);

drop policy if exists "players update own save" on public.saves;
create policy "players update own save"
  on public.saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 3. LEADERBOARD: best clear time per player per stage
-- -----------------------------------------------------------------------------
create table if not exists public.leaderboard (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  stage_id     text not null check (char_length(stage_id) between 1 and 40),
  -- A full clear takes minutes; times outside this range are rejected as nonsense.
  time_seconds numeric(8, 2) not null check (time_seconds between 30 and 36000),
  updated_at   timestamptz not null default now(),
  primary key (user_id, stage_id)
);

create index if not exists leaderboard_stage_time on public.leaderboard (stage_id, time_seconds);

alter table public.leaderboard enable row level security;

-- Everyone (even guests) can READ the leaderboard.
drop policy if exists "leaderboard is public" on public.leaderboard;
create policy "leaderboard is public"
  on public.leaderboard for select
  using (true);

-- Players can only ADD or IMPROVE their OWN score.
drop policy if exists "players insert own score" on public.leaderboard;
create policy "players insert own score"
  on public.leaderboard for insert
  with check (auth.uid() = user_id);

drop policy if exists "players update own score" on public.leaderboard;
create policy "players update own score"
  on public.leaderboard for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Submit a clear time. Keeps only the player's BEST (lowest) time.
-- "security invoker" = runs as the player, so the RLS policies above still apply.
create or replace function public.submit_time(p_stage_id text, p_time numeric)
returns numeric
language sql
security invoker set search_path = public
as $$
  insert into public.leaderboard (user_id, stage_id, time_seconds)
  values (auth.uid(), p_stage_id, p_time)
  on conflict (user_id, stage_id) do update
    set time_seconds = least(public.leaderboard.time_seconds, excluded.time_seconds),
        updated_at   = case when excluded.time_seconds < public.leaderboard.time_seconds
                            then now() else public.leaderboard.updated_at end
  returning time_seconds;
$$;

-- Only logged-in players may call it (guests have no auth.uid()).
revoke execute on function public.submit_time(text, numeric) from public, anon;
grant execute on function public.submit_time(text, numeric) to authenticated;
