# CONTINUAR — memória técnica do MagiClash

> Atualize ao fim de cada etapa grande. Última atualização: 2026-09-24 (Fases 5, 6 e 7 implementadas; falta aplicar a migration de rating e fazer o deploy).

## Estado atual

Fases **0–7 implementadas**. Testes automatizados verdes; verificação no navegador feita até a Fase 7
(ranking contra o banco real fica para depois da migration `20260924150000_ratings.sql`).

- **Jogo** (`frontend/`, Phaser 3.90): título → seleção (6 classes × 4 cores, 1–3 bots, FFA/2v2,
  3 mapas, vidas) → partida → resultados. Tela cheia (escala FIT 16:9, tecla F). Pausa com
  reiniciar/trocar personagem. Debug (F1) e câmera lenta (F2) só em DEV.
- **Simulação** (`shared/`): determinística 60 Hz, física AABB, combate por dano acumulado,
  projéteis (trajetória, cravar, explosão, perfuração, re-hit, anexados, no chão), carga,
  lentidão, desarme do Bárbaro, 4 lutadores, times, bots com 3 dificuldades.
- **Backend** (`backend/`, FastAPI): health, perfis (`GET/PATCH /api/profiles/me`,
  `GET /api/profiles/{username}`), upload de avatar validado e re-encodado. Headers, CORS,
  rate limit, limite de corpo, logs com redaction. `python main.py runserver` / `python main.py test`.
- **Online** (`realtime/` + `backend/app/api/online.py`): visitante ou conta; sala privada por código
  (duelo, FFA até 4, times 2v2) e fila 1v1; lobby (classe/cor/time/pronto); servidor autoritativo 60 Hz,
  snapshots 30 Hz, predição + reconciliação no cliente, ping na tela; reconexão e forfeit (15 s);
  resultado assinado (HMAC) gravado por `record_match_result`. Detalhes: docs/NETWORKING.md §5.
- **Foto de perfil no HUD**: conta com foto enviada aparece no painel da partida (singleplayer e online;
  online o caminho vem no join token e o GS repassa a todos). Sem foto → retrato da classe.
- **Ranking (Fase 6)**: Elo no banco (1v1 ranqueado entre contas, anti win-trading), histórico,
  `GET /api/leaderboard` (temporada/semana/mês/classe), tela RANKING, rating na tela de resultados.
- **Polish (Fase 7)**: mapas Wizard Tower, Ancient Ruins, Volcanic Keep; música chiptune procedural
  (menu/batalha); controles touch (stick + botões, só em telas de toque).
- **Hospedagem**: Netlify (front) + Render (API e game server, `render.yaml`) + Supabase. Sem Vercel/Fly.
- **Supabase** (projeto `magiclash`, `cvflnhkaelgsdjrgkkfu`, sa-east-1): 4 migrations aplicadas + 1 pendente (`20260924150000_ratings.sql`)
  (`supabase/migrations/`), RLS deny-by-default verificado por testes de integração reais.
- **Contas**: login/registro email+senha (Supabase Auth), perfil (nome, favorito, avatar padrão
  ou imagem), visitante com nome temporário.

## Como rodar

```powershell
npm install
npm run dev                                   # jogo: http://localhost:5173
npm run realtime                              # game server: ws://localhost:8787/ws
cd backend; .\.venv\Scripts\python.exe main.py runserver    # API: http://localhost:8000
```
Env: `backend/.env` e `realtime/.env` (segredos, git-ignored; `GAME_SERVER_SECRET` igual nos dois) e
`frontend/.env.local` (só valores públicos). Latência simulada: `SIMULATED_LATENCY_MS=60` no game server.

## Testes

| Comando | O quê |
|---|---|
| `npm test` | 94 testes vitest: física, combate, exploits, classes, projéteis, bots, predição, contrato dados↔assets, game server (salas, tokens, WS) |
| `npm run typecheck` | TS estrito shared + frontend + realtime |
| `cd backend; .\.venv\Scripts\python.exe main.py test` | 88 testes pytest: segurança, perfis (fake), avatar, online (guest, salas, fila, resultado assinado) |
| `SUPABASE_IT=1 … pytest tests/test_supabase_integration.py` | 10 testes de RLS/funções no Supabase real (cria/apaga usuários) |
| `STATS_OUT=arquivo npm run sim:balance` | matriz de balanceamento bot×bot |
| `ART_PREVIEW_DIR=pasta npx vitest run frontend/tests/art.preview.test.ts` | PNGs da arte procedural para revisão |

## Decisões tomadas (resumo — detalhes em docs/)

1. Phaser só renderiza; simulação é TS puro em `shared/` (reutilizada pelo futuro servidor).
2. Serverless não serve para o loop realtime → **game server Node/TS persistente**; API e game server no Render.
3. Arte da Fase 1–4 é **procedural** (pixel puppets com proporção fixa, paleta única). Nenhum
   asset de IA entrou no jogo. Frames têm nomes estáveis para troca pela arte final.
4. Escala: FIT preenchendo a janela (pedido do usuário), nearest-neighbour.
5. `__DEV_TOOLS__` (modo do Vite) em vez de `import.meta.env.DEV`: a máquina tem
   `NODE_ENV=development` global, que vazava ferramentas de debug no build.
6. Validação de token no backend via `GET /auth/v1/user` (autoritativo, cobre revogação), com cache de 60 s.
7. Stats/rating só podem ser escritos pelo backend (sem policies de escrita + REVOKE).
8. Game server Node/TS (`ws`) roda a mesma sim do cliente; cliente só manda bits de botão.
9. Auth do WS na primeira mensagem (token nunca na URL); join token de uso único, 120 s.
10. Oponentes online são extrapolados com o último input (não interpolados no passado).

## Bugs / pendências conhecidas

- `sb_secret_…` fornecida é recusada ("Unregistered API key"); usando o JWT legado service_role.
  **Rotacionar chaves** antes de produção (foram compartilhadas em chat).
- Registro pela UI depende da confirmação de email do Supabase (mensagem exibida).
- Autodestruições dos bots ainda ~0,3/partida em hard; ok para bots, refinar depois.
- **Migration pendente** `20260924150000_ratings.sql` (Elo + leaderboard). Sem ela tudo funciona,
  mas a tela RANKING mostra "indisponível" e partidas não alteram rating (resultados continuam gravados).
- Testes adiados a pedido do usuário: E2E do ranking com banco real e teste em celular real.

## Próximos passos

Aplicar a migration de rating, deploy (docs/DEPLOY.md), depois os testes adiados — ver [docs/ROADMAP.md](docs/ROADMAP.md).
