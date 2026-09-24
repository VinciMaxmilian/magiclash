# MagiClash — Roadmap técnico

| Fase | Conteúdo | Estado |
|---|---|---|
| 0 | Análise, arquitetura, Art Bible, docs | ✅ |
| 1 | Vertical slice: Cavaleiro vs Bot em Castle Courtyard | ✅ |
| 2 | Bárbaro, Arqueiro, Magos (Fogo/Gelo/Raio): projéteis, carga, lentidão, desarme | ✅ |
| 3 | Singleplayer: seleção de personagem/cor/mapa/modo/bots, 3 mapas, resultados | ✅ |
| 4 | Contas: Supabase Auth, perfil, avatar (padrão + upload validado), estatísticas (leitura) | ✅ |
| 5 | Multiplayer: game server autoritativo (Node/TS + ws), salas privadas 1v1/FFA/2v2, matchmaking 1v1, predição + reconciliação, resultado assinado | ✅ (falta deploy Fly.io) |
| 6 | Leaderboard: rating Elo/Glicko server-side, histórico, temporadas | ⏳ próxima |
| 7 | Polish: arte final curada, música, VFX, mapas restantes, transições, performance | ⏳ |

## Próximos passos detalhados

**Fase 5 — o que resta**
- Deploy do game server no Fly.io (região `gru`): Dockerfile + `fly.toml`, `ALLOWED_ORIGINS` com o
  domínio do Netlify, `API_URL` da Vercel, mesmo `GAME_SERVER_SECRET` da API. Pedir confirmação antes.
- Aplicar a migration `20260924140000_account_deletion.sql` (exclusão de conta que já jogou online).

**Fase 6**: Elo por fila dentro de `record_match_result` (já existe e valida o resultado),
`rating_history`, tela Leaderboard (global/semanal/mensal/por personagem), temporadas. Avaliar baixar
a duração mínima aceita (hoje 600 ticks = 10 s; uma vitória legítima de 1 vida levou 648).

**Fase 7**: substituir arte procedural por pixel art curada (pipeline em ASSETS.md, com
Higgsfield para referências), trilha sonora, SFX gravados, Wizard Tower / Ancient Ruins /
Volcanic Keep, controles touch (`InputSource` pronto), remapeamento de teclas, Phaser 4 (opcional).

## Dívidas técnicas conhecidas
- Rate limit do backend é por instância (memória); trocar por Upstash/Postgres antes de produção.
- Bundle do Phaser 1,2 MB (330 KB gzip) — aceitável; avaliar build custom do Phaser.
- Rate limit e uso único de join token do game server são por processo (memória): ok com 1 máquina;
  com várias, fixar cada sala numa máquina (fly-replay) e mover o registro de `jti` para Redis/Postgres.
- Foto de perfil aparece no HUD da partida; no lobby e na tela de resultados ainda é o retrato da classe.
- Hurtboxes fixas por personagem (não mudam com a pose); refinar por estado na Fase 7.
- Chave `sb_secret_…` fornecida foi recusada pelo Supabase; backend usa o JWT legado
  `service_role`. Gerar nova secret key no painel e rotacionar antes de produção.
