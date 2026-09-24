-- Phase 6: server-side rating (Elo), rating history and leaderboards.
--
-- record_match_result now also rates ranked matches and returns the rating changes, so the game
-- server can show them on the results screen. Everything still happens in ONE transaction and
-- only the service role can call it.

drop function if exists public.record_match_result(uuid, int, int, jsonb);

create function public.record_match_result(
  p_match uuid,
  p_duration_ticks int,
  p_winner_team int,
  p_participants jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches%rowtype;
  p jsonb;
  c jsonb;
  n int;
  total_kos int := 0;
  total_deaths int := 0;
  won boolean;
  v_season int;
  v_rated boolean;
  v_changes jsonb := '[]'::jsonb;
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
  -- 5 s: a 1-stock duel can legitimately end in ~11 s (648 ticks seen in testing).
  if p_duration_ticks < 60 * 5 or p_duration_ticks > 60 * 60 * 15 then
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
    if (p ->> 'deaths')::int > m.stocks or (p ->> 'kos')::int < 0 or (p ->> 'damage_dealt')::int < 0
       or (p ->> 'placement')::int not between 1 and n then
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

  -- ── Rating ────────────────────────────────────────────────────────────────
  -- Only ranked queue matches where EVERY participant is an account: a guest has no rating, and
  -- rating against throwaway guests would be free to farm.
  select id into v_season from public.seasons where is_active limit 1;
  v_rated := m.ranked
    and m.queue in ('1v1', 'ffa', '2v2')
    and v_season is not null
    and not exists (select 1 from jsonb_array_elements(p_participants) x where x ->> 'user_id' is null);

  if v_rated then
    -- Accounts created before the active season started have no row yet.
    insert into public.player_ratings (user_id, season_id, queue)
    select (x ->> 'user_id')::uuid, v_season, m.queue from jsonb_array_elements(p_participants) x
    on conflict do nothing;
    -- Lock in a stable order: two results touching the same players can't deadlock.
    perform 1 from public.player_ratings r
     where r.season_id = v_season and r.queue = m.queue
       and r.user_id in (select (x ->> 'user_id')::uuid from jsonb_array_elements(p_participants) x)
     order by r.user_id
       for update;

    -- Pairwise Elo against every player of another team, from PRE-match ratings, K = 32.
    -- 1v1 is exactly classic Elo. A pair with 5+ rated matches in the last 24 h stops moving
    -- each other's rating (win trading); the match still counts for stats.
    with ps as (
      select (x ->> 'user_id')::uuid as uid, (x ->> 'slot')::int as slot, (x ->> 'team')::int as team,
             (x ->> 'placement')::int as place
        from jsonb_array_elements(p_participants) x
    ), rt as (
      select ps.*, r.rating
        from ps
        join public.player_ratings r on r.user_id = ps.uid and r.season_id = v_season and r.queue = m.queue
    ), pairs as (
      select a.uid, a.slot, a.team, a.rating,
             case when a.place < b.place then 1.0 when a.place = b.place then 0.5 else 0.0 end as score,
             1.0 / (1.0 + power(10.0, (b.rating - a.rating) / 400.0)) as expected,
             (select count(*)
                from public.match_participants x
                join public.match_participants y on y.match_id = x.match_id and y.user_id = b.uid
                join public.matches mm on mm.id = x.match_id
               where x.user_id = a.uid and mm.ranked and mm.status = 'finished'
                 and mm.ended_at > now() - interval '24 hours') as recent
        from rt a
        join rt b on b.team <> a.team
    ), d as (
      select uid, slot, team, rating,
             round(32 * coalesce(sum(score - expected) filter (where recent < 5), 0) / count(*))::int as delta
        from pairs
       group by uid, slot, team, rating
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'slot', slot, 'user_id', uid, 'team', team,
             'before', rating, 'after', greatest(100, rating + delta)) order by slot), '[]'::jsonb)
      into v_changes
      from d;

    for c in select * from jsonb_array_elements(v_changes) loop
      won := p_winner_team >= 0 and (c ->> 'team')::int = p_winner_team;
      update public.player_ratings set
        rating = (c ->> 'after')::int,
        matches = matches + 1,
        wins = wins + case when won then 1 else 0 end,
        losses = losses + case when not won and p_winner_team >= 0 then 1 else 0 end,
        updated_at = now()
      where user_id = (c ->> 'user_id')::uuid and season_id = v_season and queue = m.queue;

      update public.match_participants set
        rating_before = (c ->> 'before')::int,
        rating_after = (c ->> 'after')::int
      where match_id = p_match and slot = (c ->> 'slot')::smallint;

      insert into public.rating_history (user_id, match_id, season_id, queue, delta, rating_after)
      values ((c ->> 'user_id')::uuid, p_match, v_season, m.queue,
              (c ->> 'after')::int - (c ->> 'before')::int, (c ->> 'after')::int);
    end loop;
  end if;

  update public.matches set
    status = 'finished',
    ended_at = now(),
    duration_ticks = p_duration_ticks,
    winner_team = p_winner_team
  where id = p_match;

  delete from public.private_rooms where match_id = p_match;

  return jsonb_build_object(
    'rated', v_rated,
    'ratings', (select coalesce(jsonb_agg(jsonb_build_object('slot', x -> 'slot', 'before', x -> 'before', 'after', x -> 'after')), '[]'::jsonb)
                  from jsonb_array_elements(v_changes) x)
  );
end;
$$;

revoke execute on function public.record_match_result(uuid, int, int, jsonb) from public, anon, authenticated;
grant execute on function public.record_match_result(uuid, int, int, jsonb) to service_role;

create index if not exists rating_history_board on public.rating_history (season_id, queue, created_at);
create index if not exists match_participants_character on public.match_participants (character_id) where user_id is not null;

-- ── Leaderboards ─────────────────────────────────────────────────────────────
-- p_period: 'season' (current rating), 'week' / 'month' (rating gained in the window),
-- 'character' (ranked wins with p_character this season). Returns the top p_limit plus the
-- row of p_me (if ranked), so the caller can show "your position" without a second query.
create function public.leaderboard(p_queue text, p_period text, p_character text, p_limit int, p_me uuid)
returns table (
  pos bigint,
  user_id uuid,
  username text,
  avatar_id text,
  avatar_path text,
  score int,
  rating int,
  wins int,
  losses int,
  matches int
)
language sql
stable
set search_path = ''
as $$
  with season as (
    select id, starts_at from public.seasons where is_active limit 1
  ), base as (
    select r.user_id, r.rating as score, r.rating, r.wins, r.losses, r.matches
      from public.player_ratings r
      join season s on s.id = r.season_id
     where p_period = 'season' and r.queue = p_queue and r.matches > 0
    union all
    select h.user_id, sum(h.delta)::int, max(r.rating),
           (count(*) filter (where h.delta > 0))::int, (count(*) filter (where h.delta < 0))::int, count(*)::int
      from public.rating_history h
      join season s on s.id = h.season_id
      join public.player_ratings r on r.user_id = h.user_id and r.season_id = h.season_id and r.queue = h.queue
     where p_period in ('week', 'month') and h.queue = p_queue
       and h.created_at > now() - case when p_period = 'week' then interval '7 days' else interval '30 days' end
     group by h.user_id
    union all
    select mp.user_id,
           (count(*) filter (where mp.team = mt.winner_team))::int,
           max(r.rating),
           (count(*) filter (where mp.team = mt.winner_team))::int,
           (count(*) filter (where mt.winner_team >= 0 and mp.team <> mt.winner_team))::int,
           count(*)::int
      from public.match_participants mp
      join public.matches mt on mt.id = mp.match_id
      join season s on mt.ended_at >= s.starts_at
      left join public.player_ratings r on r.user_id = mp.user_id and r.season_id = s.id and r.queue = p_queue
     where p_period = 'character' and mp.user_id is not null and mp.character_id = p_character
       and mt.status = 'finished' and mt.ranked and mt.queue = p_queue
     group by mp.user_id
  ), ranked as (
    select rank() over (order by b.score desc, b.wins desc, p.created_at asc) as pos,
           b.user_id, p.username::text as username, p.avatar_id, p.avatar_path,
           b.score, coalesce(b.rating, 1000) as rating, b.wins, b.losses, b.matches
      from base b
      join public.profiles p on p.id = b.user_id
  )
  select pos, user_id, username, avatar_id, avatar_path, score, rating, wins, losses, matches
    from ranked
   where pos <= least(greatest(p_limit, 1), 100) or user_id = p_me
   order by pos, username;
$$;

revoke execute on function public.leaderboard(text, text, text, int, uuid) from public, anon, authenticated;
grant execute on function public.leaderboard(text, text, text, int, uuid) to service_role;
