-- MagiClash — initial schema (docs/DATABASE.md)
-- RLS deny-by-default: every table has RLS on; clients only get the SELECTs below and a
-- couple of column-restricted UPDATEs on their own rows. Competitive data (stats, ratings,
-- matches, results) is written exclusively by the backend with the service role.

create extension if not exists citext with schema extensions;

-- ── Profiles ────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext not null unique
    check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  avatar_id text not null default 'knight'
    check (avatar_id in ('knight', 'barbarian', 'archer', 'fire_mage', 'ice_mage', 'lightning_mage')),
  avatar_path text
    check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f]{32}\.webp$'),
  favorite_character text not null default 'knight'
    check (favorite_character in ('knight', 'barbarian', 'archer', 'fire_mage', 'ice_mage', 'lightning_mage')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 4096),
  updated_at timestamptz not null default now()
);

create table public.player_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  matches integer not null default 0 check (matches >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  kos integer not null default 0 check (kos >= 0),
  deaths integer not null default 0 check (deaths >= 0),
  damage_dealt bigint not null default 0 check (damage_dealt >= 0),
  updated_at timestamptz not null default now()
);

-- ── Seasons and ratings ─────────────────────────────────────────────────────

create table public.seasons (
  id serial primary key,
  name text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default false
);
create unique index seasons_one_active on public.seasons (is_active) where is_active;

create table public.player_ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  season_id integer not null references public.seasons (id) on delete cascade,
  queue text not null check (queue in ('1v1', 'ffa', '2v2')),
  rating integer not null default 1000,
  rd numeric(6, 2) not null default 350,
  matches integer not null default 0 check (matches >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, season_id, queue)
);
create index player_ratings_board on public.player_ratings (season_id, queue, rating desc);

-- ── Matches ─────────────────────────────────────────────────────────────────

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('ffa', 'teams')),
  queue text not null check (queue in ('1v1', 'ffa', '2v2', 'private')),
  map_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'finished', 'aborted', 'rejected')),
  ranked boolean not null default false,
  server_region text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table public.match_participants (
  match_id uuid not null references public.matches (id) on delete cascade,
  slot smallint not null check (slot between 0 and 3),
  user_id uuid references auth.users (id) on delete set null,
  guest_name text check (guest_name is null or guest_name ~ '^[A-Za-z0-9_]{3,16}$'),
  character_id text not null,
  team smallint not null check (team between 0 and 3),
  placement smallint,
  kos integer not null default 0,
  deaths integer not null default 0,
  damage_dealt integer not null default 0,
  rating_before integer,
  rating_after integer,
  primary key (match_id, slot)
);
create index match_participants_user on public.match_participants (user_id);

create table public.rating_history (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  season_id integer not null references public.seasons (id),
  queue text not null,
  delta integer not null,
  rating_after integer not null,
  created_at timestamptz not null default now()
);
create index rating_history_user on public.rating_history (user_id, created_at desc);

create table public.matchmaking_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  guest_id text,
  queue text not null check (queue in ('1v1', 'ffa', '2v2')),
  character_id text not null,
  status text not null default 'searching' check (status in ('searching', 'matched', 'cancelled', 'expired')),
  match_id uuid references public.matches (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  check (user_id is not null or guest_id is not null)
);
create index matchmaking_tickets_search on public.matchmaking_tickets (queue, created_at) where status = 'searching';

create table public.security_events (
  id bigserial primary key,
  type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  user_id uuid,
  match_id uuid,
  ip_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.profiles_private enable row level security;
alter table public.player_stats enable row level security;
alter table public.seasons enable row level security;
alter table public.player_ratings enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.rating_history enable row level security;
alter table public.matchmaking_tickets enable row level security;
alter table public.security_events enable row level security;

-- Defense in depth: clients never write competitive tables, even if a policy slipped in.
revoke insert, update, delete, truncate on
  public.player_stats, public.seasons, public.player_ratings, public.matches,
  public.match_participants, public.rating_history, public.matchmaking_tickets, public.security_events
  from anon, authenticated;
revoke all on public.security_events from anon, authenticated;
revoke insert, delete, truncate on public.profiles, public.profiles_private from anon, authenticated;
revoke update on public.profiles, public.profiles_private from anon, authenticated;
-- Only these columns are client-editable (own row, enforced by the policies below).
grant update (avatar_id, favorite_character) on public.profiles to authenticated;
grant update (settings) on public.profiles_private to authenticated;

create policy "profiles are public" on public.profiles
  for select to anon, authenticated using (true);
create policy "users update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "users read their own private data" on public.profiles_private
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users update their own private data" on public.profiles_private
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "stats are public" on public.player_stats for select to anon, authenticated using (true);
create policy "seasons are public" on public.seasons for select to anon, authenticated using (true);
create policy "ratings are public" on public.player_ratings for select to anon, authenticated using (true);
create policy "rating history is public" on public.rating_history for select to anon, authenticated using (true);

-- Security definer helper avoids RLS recursion between matches ↔ match_participants.
-- It only answers "am I a participant of this match?" for the calling user.
create or replace function public.is_match_participant(m uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.match_participants mp
    where mp.match_id = m and mp.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_match_participant(uuid) from public;
grant execute on function public.is_match_participant(uuid) to anon, authenticated;

create policy "finished matches are public, participants see their own" on public.matches
  for select to anon, authenticated using (status = 'finished' or public.is_match_participant(id));
create policy "participants of visible matches" on public.match_participants
  for select to anon, authenticated using (
    exists (select 1 from public.matches m where m.id = match_id and m.status = 'finished')
    or user_id = (select auth.uid())
  );

create policy "users see their own tickets" on public.matchmaking_tickets
  for select to authenticated using (user_id = (select auth.uid()));

-- security_events: no policies at all (service role only).

-- ── Triggers ────────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger profiles_private_touch before update on public.profiles_private
  for each row execute function public.touch_updated_at();

-- New auth user → profile + private row + stats + ratings for the active season.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := new.raw_user_meta_data ->> 'username';
  final_name text;
  active_season integer;
begin
  if wanted is not null
     and wanted ~ '^[A-Za-z0-9_]{3,16}$'
     and not exists (select 1 from public.profiles p where p.username = wanted::extensions.citext) then
    final_name := wanted;
  else
    final_name := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  insert into public.profiles (id, username) values (new.id, final_name);
  insert into public.profiles_private (user_id) values (new.id);
  insert into public.player_stats (user_id) values (new.id);

  select id into active_season from public.seasons where is_active limit 1;
  if active_season is not null then
    insert into public.player_ratings (user_id, season_id, queue)
    select new.id, active_season, q from unnest(array['1v1', 'ffa', '2v2']) as q;
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Leaderboard (security invoker → respects RLS of the underlying tables) ──

create view public.leaderboard_global
with (security_invoker = true) as
select
  rank() over (partition by r.queue order by r.rating desc, r.wins desc, p.created_at asc) as position,
  r.queue,
  p.username,
  p.avatar_id,
  p.avatar_path,
  r.rating,
  r.wins,
  r.losses,
  r.matches
from public.player_ratings r
join public.profiles p on p.id = r.user_id
join public.seasons s on s.id = r.season_id and s.is_active
where r.matches > 0;

grant select on public.leaderboard_global to anon, authenticated;

-- ── Seed: first season ──────────────────────────────────────────────────────

insert into public.seasons (name, is_active) values ('Temporada 1', true);

-- ── Storage: avatars ────────────────────────────────────────────────────────
-- Public read; NO client upload policy. Uploads go through the backend, which validates
-- size/MIME/magic bytes, re-encodes to WebP and stores `<user_id>/<random>.webp`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/png'])
on conflict (id) do nothing;
