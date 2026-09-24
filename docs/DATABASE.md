# MagiClash — Banco de Dados (Supabase)

Status (Fase 4): **aplicado** no projeto `magiclash` (`cvflnhkaelgsdjrgkkfu`) via migrations
versionadas em `supabase/migrations/` (`initial_schema`, `hardening`). Advisors de segurança: só o
INFO intencional de `security_events` sem policy. RLS verificado por
`backend/tests/test_supabase_integration.py` contra o banco real.

## Princípios

1. **RLS deny-by-default:** RLS habilitado em *todas* as tabelas de `public`; sem policy = sem acesso.
2. **Clientes (anon/authenticated) só leem.** Nenhuma tabela de estatística, rating, partida ou
   resultado tem policy de INSERT/UPDATE/DELETE para clientes. Toda escrita competitiva passa pelo
   backend (service role) depois de validação.
3. **Público separado de privado:** `profiles` (público) vs `profiles_private` (dono).
4. **Migrations versionadas.** Nenhuma alteração manual no dashboard sem migration correspondente.

## Tabelas

| Tabela | Conteúdo | Leitura cliente | Escrita cliente |
|---|---|---|---|
| `profiles` | id (=auth.users.id), username (único, case-insensitive), avatar_kind/avatar_id/avatar_path, favorite_character, created_at | todos | **UPDATE só do próprio**, e só colunas `avatar_id`, `favorite_character` (via column privileges). `username` via backend (validação/moderação) |
| `profiles_private` | user_id, settings (jsonb: volumes, bindings), updated_at | dono | dono (settings) |
| `player_stats` | user_id, matches, wins, losses, kos, deaths, damage_dealt, updated_at | todos | nenhuma |
| `seasons` | id, name, starts_at, ends_at, is_active | todos | nenhuma |
| `player_ratings` | user_id, season_id, queue (`1v1`, `ffa`, `2v2`), rating, rd, matches, wins, losses | todos | nenhuma |
| `matches` | id, mode, queue, map_id, status (`pending/active/finished/aborted/rejected`), ranked, server_region, created/started/ended_at | participantes + partidas finalizadas públicas | nenhuma |
| `match_participants` | match_id, slot, user_id (nullable p/ guest), guest_name, character_id, team, placement, kos, deaths, damage_dealt, rating_before/after | idem `matches` | nenhuma |
| `rating_history` | id, user_id, match_id, season_id, queue, delta, rating_after, created_at | todos | nenhuma |
| `matchmaking_tickets` | id, user_id / guest_id, queue, character_id, status, match_id, created_at, expires_at | **só o dono** (usado para Realtime "match found") | nenhuma (backend) |
| `private_rooms` | code (6 letras), match_id, host, expires_at (2 h) | nenhuma | nenhuma (backend) |
| `match_entries` | um registro por join token emitido (match, user/guest, display_name, jti). A conta apagada leva junto (`on delete cascade`, migration 20260924140000) | nenhuma | nenhuma (backend) |
| `security_events` | id, type, severity, user_id, match_id, ip_hash, details jsonb, created_at | **nenhuma** | nenhuma |

Views:
- `leaderboard_global` (`security_invoker = true`): posição (`rank() over`), username, avatar, rating,
  wins, losses, matches — da temporada ativa, fila escolhida.
- Futuro: `leaderboard_weekly`/`monthly` agregam `rating_history` por janela; ranking por personagem
  agrega `match_participants.character_id`.

## Funções (SECURITY DEFINER, `search_path` fixo, executáveis só pela service role)

- `record_match_result(...)` (Fase 5): transação única que valida estado da partida, participantes
  (só quem recebeu join token), coerência (KOs ≤ mortes, duração 600–54 000 ticks), grava participantes,
  atualiza `player_stats`, muda status para `finished`. Idempotente. Fase 6 adiciona `player_ratings` e
  `rating_history`.
- `app_private.is_match_participant(match)`: helper das policies (schema não exposto pela API).
- `mm_try_match(queue)`: pareia tickets com `FOR UPDATE SKIP LOCKED` (sem corrida entre instâncias
  serverless).

`REVOKE EXECUTE … FROM anon, authenticated` em todas.

## Storage

Bucket `avatars`:
- `public = true` apenas para leitura (avatares são públicos), `file_size_limit = 512 KB`,
  `allowed_mime_types = image/png, image/webp`.
- **Sem policy de INSERT para clientes.** Upload via backend: valida tamanho, MIME real (magic
  bytes), extensão, dimensões, re-encoda a imagem (remove payloads/metadata), grava com nome
  aleatório `avatars/{user_id}/{uuid}.webp`. Isso bloqueia executáveis/SVG com script por construção.

## Rating

Início: Elo (K=32, 1000 inicial) por fila; FFA como pares; 2v2 com média do time.
Colunas `rd` já existem para migrar para Glicko-2 sem mudar o schema.
Temporadas: `player_ratings` é por `(user_id, season_id, queue)`.
