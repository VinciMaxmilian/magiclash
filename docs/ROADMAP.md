# MagiClash — Roadmap técnico

| Fase | Conteúdo | Estado |
|---|---|---|
| 0 | Análise, arquitetura, Art Bible, docs | ✅ |
| 1 | Vertical slice: Cavaleiro vs Bot em Castle Courtyard | ✅ |
| 2 | Bárbaro, Arqueiro, Magos (Fogo/Gelo/Raio): projéteis, carga, lentidão, desarme | ✅ |
| 3 | Singleplayer: seleção de personagem/cor/mapa/modo/bots, 3 mapas, resultados | ✅ |
| 4 | Contas: Supabase Auth, perfil, avatar (padrão + upload validado), estatísticas (leitura) | ✅ |
| 5 | Multiplayer: game server autoritativo (Node/TS + ws), salas privadas 1v1/FFA/2v2, matchmaking 1v1, predição + reconciliação, resultado assinado | ✅ |
| 6 | Leaderboard: Elo server-side (1v1 ranqueado entre contas), histórico, ranking temporada/semana/mês/classe, rating nos resultados | ✅ (migration `20260924150000_ratings.sql` a aplicar) |
| 7 | Polish: Wizard Tower, Ancient Ruins, Volcanic Keep; música chiptune procedural; controles touch; foto de perfil no HUD | ✅ (arte curada/SFX gravados seguem abertos) |

## Próximos passos detalhados

**Pendente para produção**
- Aplicar `supabase/migrations/20260924150000_ratings.sql` (Elo + funções de leaderboard).
- Deploy: Netlify + Render (`render.yaml` ou serviços manuais) — docs/DEPLOY.md.
- Testes E2E de ranking contra o banco real (depois da migration) e teste em celular real.

**Depois**: arte curada substituindo a procedural (pipeline em ASSETS.md), SFX gravados,
remapeamento de teclas, filas ranqueadas FFA/2v2 (o banco já calcula Elo por pares/time),
temporadas com reset, Phaser 4 (opcional).

## Dívidas técnicas conhecidas
- Rate limit do backend é por instância (memória); trocar por Upstash/Postgres antes de produção.
- Bundle do Phaser 1,2 MB (330 KB gzip) — aceitável; avaliar build custom do Phaser.
- Rate limit e uso único de join token do game server são por processo (memória): ok com 1 máquina;
  com várias, fixar cada sala numa máquina (fly-replay) e mover o registro de `jti` para Redis/Postgres.
- Foto de perfil aparece no HUD da partida; no lobby e na tela de resultados ainda é o retrato da classe.
- Hurtboxes fixas por personagem (não mudam com a pose); refinar por estado na Fase 7.
- Chave `sb_secret_…` fornecida foi recusada pelo Supabase; backend usa o JWT legado
  `service_role`. Gerar nova secret key no painel e rotacionar antes de produção.
