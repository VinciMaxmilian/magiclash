-- Account deletion was blocked for anyone who had joined an online match:
-- match_entries.user_id was ON DELETE SET NULL, but the row check requires a user or a guest.
-- Join entries are short-lived audit rows holding the display name, so they go with the account.
-- (match_participants keeps the anonymised history: its user_id is still SET NULL.)
alter table public.match_entries
  drop constraint match_entries_user_id_fkey,
  add constraint match_entries_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
