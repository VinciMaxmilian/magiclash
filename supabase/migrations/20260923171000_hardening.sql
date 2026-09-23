-- Hardening after running the Supabase advisors on the initial schema.
-- 1. The RLS helper must not be callable through PostgREST (/rest/v1/rpc): move it to a
--    private schema that is not exposed by the API.
-- 2. Cover the remaining foreign keys with indexes.

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to anon, authenticated;

create or replace function app_private.is_match_participant(m uuid)
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
revoke execute on function app_private.is_match_participant(uuid) from public;
grant execute on function app_private.is_match_participant(uuid) to anon, authenticated;

drop policy "finished matches are public, participants see their own" on public.matches;
create policy "finished matches are public, participants see their own" on public.matches
  for select to anon, authenticated using (status = 'finished' or app_private.is_match_participant(id));

drop function public.is_match_participant(uuid);

create index if not exists matchmaking_tickets_match on public.matchmaking_tickets (match_id);
create index if not exists matchmaking_tickets_user on public.matchmaking_tickets (user_id);
create index if not exists rating_history_match on public.rating_history (match_id);
create index if not exists rating_history_season on public.rating_history (season_id);
