# MagiClash — Deploy

| Parte | Onde | Config |
|---|---|---|
| Frontend | Netlify | `netlify.toml` (raiz) |
| API | Vercel (Python) | `backend/vercel.json`, `backend/api/index.py`, `backend/requirements.txt` |
| Banco/Auth/Storage | Supabase | `supabase/migrations/*.sql` |
| Game server realtime | Fly.io (a configurar) | `realtime/` (`npm run build -w @magiclash/realtime` → `dist/index.js`) |

## Frontend (Netlify)

- Base: raiz do repo. Build: `npm ci && npm test && npm run build`. Publish: `frontend/dist`.
- `NODE_ENV=production` fixo no build. As ferramentas de debug dependem do **modo do Vite**
  (`__DEV_TOOLS__`), então nem entram no bundle de produção.
- Headers de segurança e CSP em `netlify.toml`. Ao ligar features online, restrinja `connect-src`
  aos domínios reais da API, do Supabase e do game server.
- Variáveis públicas (quando existirem): `VITE_API_URL`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`. **Nunca** a service role.

## API (Vercel)

- Root directory do projeto na Vercel: `backend/`. Runtime Python (3.12+).
- Variáveis (Settings → Environment Variables): `ENV=production`, `ALLOWED_ORIGINS=https://<site>.netlify.app`,
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GAME_SERVER_SECRET`,
  `GUEST_TOKEN_SECRET`, `REALTIME_URL=wss://<app>.fly.dev/ws`.
- `/api/docs` e `/api/openapi.json` ficam desligados quando `ENV=production`.

## Game server (Fly.io)

- Variáveis: `NODE_ENV=production`, `GAME_SERVER_SECRET` (igual ao da API, ≥ 32 chars),
  `API_URL=https://<api>.vercel.app`, `ALLOWED_ORIGINS=https://<site>.netlify.app`, `PORT=8787`.
- `SIMULATED_LATENCY_MS` é ignorado em produção.
- Uma máquina basta no início (salas e `jti` ficam em memória).

## Local

```powershell
npm install
npm run dev                      # jogo em http://localhost:5173
npm test                         # testes da simulação/front (vitest)
npm run build                    # build de produção em frontend/dist

npm run realtime                 # game server em ws://localhost:8787/ws (lê realtime/.env)

cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe main.py test
.\.venv\Scripts\python.exe main.py runserver     # API em http://localhost:8000
```

Atenção: esta máquina tem `NODE_ENV=development` definido como variável de usuário. Isso não afeta
o jogo (o gate de debug usa o modo do Vite), mas pode afetar outras ferramentas Node.

## Checklist antes de cada deploy

- [ ] `npm test`, `npm run typecheck`, `pytest` verdes
- [ ] `npm run build` sem chunk de debug (`frontend/dist/assets` sem `DebugOverlay*`)
- [ ] Nenhum segredo em `frontend/` (`grep -ri "service_role" frontend/src` vazio)
- [ ] Migrations novas revisadas, aplicadas primeiro em branch/staging do Supabase
- [ ] `CONTINUAR.md` atualizado
