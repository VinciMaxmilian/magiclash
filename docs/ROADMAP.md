# MagiClash — Roadmap técnico

| Fase | Conteúdo | Estado |
|---|---|---|
| 0 | Análise, arquitetura, Art Bible, docs | ✅ |
| 1 | Vertical slice: Cavaleiro vs Bot em Castle Courtyard | ✅ |
| 2 | Bárbaro, Arqueiro, Magos (Fogo/Gelo/Raio): projéteis, carga, lentidão, desarme | ✅ |
| 3 | Singleplayer: seleção de personagem/cor/mapa/modo/bots, 3 mapas, resultados | ✅ |
| 4 | Contas: Supabase Auth, perfil, avatar (padrão + upload validado), estatísticas (leitura) | ✅ |
| 5 | Multiplayer: game server autoritativo (Node/TS + ws) → 1v1 privado → matchmaking → 4P → 2v2 | ⏳ próxima |
| 6 | Leaderboard: rating Elo/Glicko server-side, histórico, temporadas | ⏳ |
| 7 | Polish: arte final curada, música, VFX, mapas restantes, transições, performance | ⏳ |

## Próximos passos detalhados

**Fase 5**
1. `realtime/`: servidor Node/TS com `ws`, salas, loop 60 Hz rodando `@magiclash/shared`.
2. Join token (JWT HS256, 60 s, uso único) emitido pela API; sala privada por código.
3. Cliente: `NetClient` com interpolação de snapshots; depois predição + reconciliação.
4. Matchmaking via API + Postgres (`matchmaking_tickets`, `FOR UPDATE SKIP LOCKED`).
5. Resultado assinado (HMAC) do servidor → API → `record_match_result` (transação, idempotente).
6. Deploy Fly.io (região `gru`).

**Fase 6**: função `record_match_result`, Elo por fila, `rating_history`, tela Leaderboard
(global/semanal/mensal/por personagem), temporadas.

**Fase 7**: substituir arte procedural por pixel art curada (pipeline em ASSETS.md, com
Higgsfield para referências), trilha sonora, SFX gravados, Wizard Tower / Ancient Ruins /
Volcanic Keep, controles touch (`InputSource` pronto), remapeamento de teclas, Phaser 4 (opcional).

## Dívidas técnicas conhecidas
- Rate limit do backend é por instância (memória); trocar por Upstash/Postgres antes de produção.
- Bundle do Phaser 1,2 MB (330 KB gzip) — aceitável; avaliar build custom do Phaser.
- Hurtboxes fixas por personagem (não mudam com a pose); refinar por estado na Fase 7.
- Chave `sb_secret_…` fornecida foi recusada pelo Supabase; backend usa o JWT legado
  `service_role`. Gerar nova secret key no painel e rotacionar antes de produção.
