# MagiClash — Deploy

| Parte | Onde | Config |
|---|---|---|
| Frontend | Netlify | `netlify.toml` (raiz) |
| API | Vercel (Python) | `backend/vercel.json`, `backend/api/index.py`, `backend/requirements.txt` |
| Banco/Auth/Storage | Supabase | `supabase/migrations/*.sql` |
| Game server realtime | Fly.io (Fase 5) | `realtime/` |

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
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
  `GAME_SERVER_SECRET`.
- `/api/docs` e `/api/openapi.json` ficam desligados quando `ENV=production`.

## Local

```powershell
npm install
npm run dev                      # jogo em http://localhost:5173
npm test                         # testes da simulação/front (vitest)
npm run build                    # build de produção em frontend/dist

cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Atenção: esta máquina tem `NODE_ENV=development` definido como variável de usuário. Isso não afeta
o jogo (o gate de debug usa o modo do Vite), mas pode afetar outras ferramentas Node.

## Checklist antes de cada deploy

- [ ] `npm test`, `npm run typecheck`, `pytest` verdes
- [ ] `npm run build` sem chunk de debug (`frontend/dist/assets` sem `DebugOverlay*`)
- [ ] Nenhum segredo em `frontend/` (`grep -ri "service_role" frontend/src` vazio)
- [ ] Migrations novas revisadas, aplicadas primeiro em branch/staging do Supabase
- [ ] `CONTINUAR.md` atualizado
