-- Phase 5 — multiplayer bookkeeping. Everything here is written by the backend (service role)
-- only; clients have no policies. Results are recorded atomically by record_match_result,
-- which also validates the report against the entries the backend actually issued.

alter table public.matches add column if not exists room_code text;
alter table public.matches add column if not exists stocks smallint not null default 3;
alter table public.matches add column if not exists max_players smallint not null default 2
  check (max_players between 2 and 4);
alter table public.matches add column if not exists duration_ticks integer;
alter table public.matches add column if not exists winner_team smallint;

-- Private rooms: a short human code that maps to a pending match.
create table public.private_rooms (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  match_id uuid not null unique references public.matches (id) on delete cascade,
  host_user uuid references auth.users (id) on delete set null,
  host_guest text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours'
);

-- Every join token the backend issues is recorded: a result can only mention these players.
create table public.match_entries (
  id bigserial primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  guest_id text check (guest_id is null or guest_id ~ '^g_[0-9a-f]{16}$'),
  display_name text not null check (display_name ~ '^[A-Za-z0-9_]{3,16}$'),
  jti text not null unique,
  created_at timestamptz not null default now(),
  check (user_id is not null or guest_id is not null)
);
create index match_entries_match on public.match_entries (match_id);
create index match_entries_user on public.match_entries (user_id);

alter table public.private_rooms enable row level security;
alter table public.match_entries enable row level security;
revoke all on public.private_rooms, public.match_entries from anon, authenticated;

-- ── Matchmaking: atomic pairing without races between serverless instances ─────────

create or replace function public.mm_try_match(p_queue text, p_needed int, p_map text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  picked uuid[];
  new_match uuid;
begin
  update public.matchmaking_tickets set status = 'expired'
   where status = 'searching' and expires_at < now();

  select array_agg(id) into picked from (
    select id from public.matchmaking_tickets
     where queue = p_queue and status = 'searching'
     order by created_at
     limit p_needed
     for update skip locked
  ) t;

  if picked is null or array_length(picked, 1) < p_needed then
    return null;
  end if;

  insert into public.matches (mode, queue, map_id, status, ranked, max_players)
  values (case when p_queue = '2v2' then 'teams' else 'ffa' end, p_queue, p_map, 'pending', true, p_needed)
  returning id into new_match;

  update public.matchmaking_tickets set status = 'matched', match_id = new_match where id = any (picked);
  return new_match;
end;
$$;

-- ── Result recording (validated, idempotent, one transaction) ──────────────────────

create or replace function public.record_match_result(
  p_match uuid,
  p_duration_ticks int,
  p_winner_team int,
  p_participants jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches%rowtype;
  p jsonb;
  n int;
  total_kos int := 0;
  total_deaths int := 0;
  won boolean;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then
    raise exception 'unknown_match' using errcode = 'P0002';
  end if;
  if m.status not in ('pending', 'active') then
    raise exception 'already_recorded' using errcode = 'P0001';
  end if;

  n := jsonb_array_length(p_participants);
  if n < 2 or n > m.max_players then
    raise exception 'bad_participant_count' using errcode = '22023';
  end if;
  if p_duration_ticks < 60 * 10 or p_duration_ticks > 60 * 60 * 15 then
    raise exception 'implausible_duration' using errcode = '22023';
  end if;

  for p in select * from jsonb_array_elements(p_participants) loop
    -- Every reported player must hold a join token issued for this match.
    if not exists (
      select 1 from public.match_entries e
       where e.match_id = p_match
         and ((p ->> 'user_id') is not null and e.user_id = (p ->> 'user_id')::uuid
           or (p ->> 'guest_id') is not null and e.guest_id = p ->> 'guest_id')
    ) then
      raise exception 'unknown_participant' using errcode = '22023';
    end if;
    if (p ->> 'deaths')::int > m.stocks or (p ->> 'kos')::int < 0 or (p ->> 'damage_dealt')::int < 0 then
      raise exception 'implausible_stats' using errcode = '22023';
    end if;
    total_kos := total_kos + (p ->> 'kos')::int;
    total_deaths := total_deaths + (p ->> 'deaths')::int;
  end loop;
  if total_kos > total_deaths then
    raise exception 'inconsistent_kos' using errcode = '22023';
  end if;

  for p in select * from jsonb_array_elements(p_participants) loop
    insert into public.match_participants
      (match_id, slot, user_id, guest_name, character_id, team, placement, kos, deaths, damage_dealt)
    values (
      p_match,
      (p ->> 'slot')::smallint,
      (p ->> 'user_id')::uuid,
      case when p ->> 'user_id' is null then p ->> 'name' else null end,
      p ->> 'character_id',
      (p ->> 'team')::smallint,
      (p ->> 'placement')::smallint,
      (p ->> 'kos')::int,
      (p ->> 'deaths')::int,
      (p ->> 'damage_dealt')::int
    );

    if (p ->> 'user_id') is not null then
      won := p_winner_team >= 0 and (p ->> 'team')::int = p_winner_team;
      update public.player_stats set
        matches = matches + 1,
        wins = wins + case when won then 1 else 0 end,
        losses = losses + case when not won and p_winner_team >= 0 then 1 else 0 end,
        kos = kos + (p ->> 'kos')::int,
        deaths = deaths + (p ->> 'deaths')::int,
        damage_dealt = damage_dealt + (p ->> 'damage_dealt')::int,
        updated_at = now()
      where user_id = (p ->> 'user_id')::uuid;
    end if;
  end loop;

  update public.matches set
    status = 'finished',
    ended_at = now(),
    duration_ticks = p_duration_ticks,
    winner_team = p_winner_team
  where id = p_match;

  delete from public.private_rooms where match_id = p_match;
end;
$$;

revoke execute on function public.mm_try_match(text, int, text) from public, anon, authenticated;
revoke execute on function public.record_match_result(uuid, int, int, jsonb) from public, anon, authenticated;
grant execute on function public.mm_try_match(text, int, text) to service_role;
grant execute on function public.record_match_result(uuid, int, int, jsonb) to service_role;
