# MagiClash — Deploy

| Parte | Onde | Config |
|---|---|---|
| Frontend | Netlify | `netlify.toml` (raiz) |
| API (FastAPI) + game server (Node) | Render — **um** web service Docker | `Dockerfile`, `deploy/start.sh`, `render.yaml` |
| Banco/Auth/Storage | Supabase | `supabase/migrations/*.sql` |

## Render (um serviço: API + game server)

```
Render :$PORT → Node (realtime/server.js)
                 ├─ /ws       WebSocket das partidas
                 ├─ /health   saúde do game server
                 └─ /api/*  → proxy → 127.0.0.1:8000 uvicorn (FastAPI, não exposto)
```

Por que um só: o plano free tem 750 h/mês **somadas** entre serviços (dois serviços 24/7 não cabem),
um só endereço, um só "acordar" e o resultado da partida vai do game server para a API por loopback.
O proxy repassa os headers sem alterar (inclusive `X-Forwarded-For`), então `TRUSTED_PROXY_HOPS=1`
continua correto na API e no game server.

Manual (New → Web Service):
- Language **Docker**, Root Directory vazio, Dockerfile Path `./Dockerfile`, Region **Virginia**,
  Instance **Free**, Health Check Path `/api/health`.
- Variáveis: `GAME_SERVER_SECRET` e `GUEST_TOKEN_SECRET` (Generate), `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS=https://<site>.netlify.app`,
  `REALTIME_URL=wss://<host do serviço>/ws`, `REGION=virginia`.
  `ENV`, `NODE_ENV`, `API_PROXY_TARGET` e `API_URL` já vêm do Dockerfile. `PORT` é do Render.

Ou **New → Blueprint** com o `render.yaml` (cria o mesmo serviço).

Notas do plano free:
- Dorme após ~15 min sem tráfego; o primeiro acesso leva ~1 min. Partida em andamento mantém acordado.
- Sem região na América do Sul: `virginia` é a mais próxima do Brasil e do Supabase `sa-east-1`.
- Salas e `jti` ficam em memória: **1 instância**.
- `SIMULATED_LATENCY_MS` é ignorado em produção; `/api/docs` fica desligado com `ENV=production`.

## Frontend (Netlify)

- Base: raiz do repo. Build: `npm ci && npm test && npm run build`. Publish: `frontend/dist`.
- `NODE_ENV=production` fixo no build. As ferramentas de debug dependem do **modo do Vite**
  (`__DEV_TOOLS__`), então nem entram no bundle de produção.
- Variáveis (só estas três, todas públicas): `VITE_API_URL=https://<host do serviço no Render>`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` (chave publishable/anon). **Nunca** segredos de servidor: o secrets
  scan do Netlify falha o build (`SECRETS_SCAN_OMIT_KEYS` só libera as três `VITE_*`).
- CSP em `netlify.toml`: `connect-src` libera `*.supabase.co` e `*.onrender.com`; depois do primeiro
  deploy, trocar pelos hosts exatos.

## Supabase

- Migrations em `supabase/migrations/`, aplicadas em ordem. Revisar antes; em produção aplicar
  primeiro num branch/staging.

## Local

```powershell
npm install
npm run dev                      # jogo em http://localhost:5173
npm run realtime                 # game server em ws://localhost:8787/ws (lê realtime/.env)
npm test                         # testes vitest (simulação, frontend, game server)
npm run build                    # build de produção em frontend/dist

cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe main.py test
.\.venv\Scripts\python.exe main.py runserver     # API em http://localhost:8000
```

Atenção: esta máquina tem `NODE_ENV=development` definido como variável de usuário. Isso não afeta
o jogo (o gate de debug usa o modo do Vite), mas pode afetar outras ferramentas Node.

## Checklist antes de cada deploy

- [ ] `npm test`, `npm run typecheck`, `main.py test` verdes
- [ ] `npm run build` sem chunk de debug (`frontend/dist/assets` sem `DebugOverlay*`)
- [ ] Nenhum segredo em `frontend/` (`grep -ri "service_role" frontend/src` vazio)
- [ ] Migrations novas revisadas e aplicadas antes do deploy da API que depende delas
- [ ] `CONTINUAR.md` atualizado
