-- Temporada 1 (extra): Ancião and Geomante are valid avatars / favorites.

alter table public.profiles drop constraint if exists profiles_avatar_id_check;
alter table public.profiles drop constraint if exists profiles_favorite_character_check;

alter table public.profiles add constraint profiles_avatar_id_check check (avatar_id in (
  'knight', 'barbarian', 'archer', 'fire_mage', 'ice_mage', 'lightning_mage',
  'hunter', 'brawler', 'vampire', 'dhampir', 'summoner', 'elder', 'geomancer'
));
alter table public.profiles add constraint profiles_favorite_character_check check (favorite_character in (
  'knight', 'barbarian', 'archer', 'fire_mage', 'ice_mage', 'lightning_mage',
  'hunter', 'brawler', 'vampire', 'dhampir', 'summoner', 'elder', 'geomancer'
));
