# MagiClash

Platform fighter 2D em pixel art de fantasia medieval — web, singleplayer com bots e multiplayer online com ranking.

- `frontend/` Vite + TypeScript + Phaser 3 (Netlify)
- `shared/` simulação determinística (física, combate, personagens, bots) usada pelo cliente e pelo servidor realtime
- `backend/` FastAPI — contas, perfis, avatar, salas, matchmaking, resultados, leaderboard
- `realtime/` game server Node/TS + WebSocket — partidas online autoritativas
  (em produção os dois rodam num único container no Render: `Dockerfile`)
- `supabase/` migrations (Postgres + RLS)
- `docs/` arquitetura, combate, networking, banco, segurança, assets (Art Bible), deploy, roadmap

Comece por [CONTINUAR.md](CONTINUAR.md).

```powershell
npm install; npm run dev                                   # jogo
npm run realtime                                          # game server
cd backend; .\.venv\Scripts\python.exe main.py runserver   # API
```

Deploy: Netlify (frontend) + Render (um serviço Docker com API e game server) + Supabase — [docs/DEPLOY.md](docs/DEPLOY.md).
