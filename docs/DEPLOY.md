# MagiClash — Deploy

| Parte | Onde | Config |
|---|---|---|
| Frontend | Netlify | `netlify.toml` (raiz) |
| API (FastAPI) | Render — web service Python | `render.yaml` → `magiclash-api` (`backend/`) |
| Game server realtime | Render — web service Node | `render.yaml` → `magiclash-realtime` (`realtime/`) |
| Banco/Auth/Storage | Supabase | `supabase/migrations/*.sql` |

## Render (API + game server)

1. Render → **New → Blueprint** → escolher o repositório. O `render.yaml` cria os dois serviços e o
   grupo `magiclash-shared` com `GAME_SERVER_SECRET` **gerado pelo Render** (igual nos dois).
   `GUEST_TOKEN_SECRET` também é gerado.
2. Preencher no painel os valores `sync: false`:
   - `magiclash-api`: `ALLOWED_ORIGINS=https://<site>.netlify.app`, `SUPABASE_URL`,
     `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (nunca no frontend),
     `REALTIME_URL=wss://<host do magiclash-realtime>/ws`.
   - `magiclash-realtime`: `API_URL=https://<host do magiclash-api>`,
     `ALLOWED_ORIGINS=https://<site>.netlify.app`.
3. Health checks: API `GET /api/health`, game server `GET /health`.

Notas do plano free:
- Os serviços **dormem** após ~15 min sem tráfego; o primeiro acesso leva ~1 min para acordar.
  Uma partida em andamento mantém o game server acordado (WebSocket ativo).
- 750 horas/mês de instância free por conta, somadas entre os serviços.
- Não há região na América do Sul: `virginia` é a mais próxima do Brasil e do Supabase `sa-east-1`.
- Salas e o registro de `jti` ficam em memória: manter **1 instância** do game server.
- `TRUSTED_PROXY_HOPS` (padrão 1) diz quantos proxies acrescentam ao `X-Forwarded-For`; o limite
  por IP usa a entrada do proxy, não a enviada pelo cliente.
- `SIMULATED_LATENCY_MS` é ignorado em produção. `/api/docs` e `/api/openapi.json` ficam desligados
  com `ENV=production`.

## Frontend (Netlify)

- Base: raiz do repo. Build: `npm ci && npm test && npm run build`. Publish: `frontend/dist`.
- `NODE_ENV=production` fixo no build. As ferramentas de debug dependem do **modo do Vite**
  (`__DEV_TOOLS__`), então nem entram no bundle de produção.
- Variáveis públicas: `VITE_API_URL=https://<host do magiclash-api>`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` (chave publishable/anon). **Nunca** a service role.
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
