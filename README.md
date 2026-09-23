# MagiClash

Platform fighter 2D em pixel art de fantasia medieval — web, multiplayer (em construção).

- `frontend/` Vite + TypeScript + Phaser 3 (Netlify)
- `shared/` simulação determinística (física, combate, personagens, bots) usada pelo cliente e pelo futuro servidor realtime
- `backend/` FastAPI (Vercel) — contas, perfis, avatar, (matchmaking/ranking nas próximas fases)
- `supabase/` migrations (Postgres + RLS)
- `docs/` arquitetura, combate, networking, banco, segurança, assets (Art Bible), deploy, roadmap

Comece por [CONTINUAR.md](CONTINUAR.md).

```powershell
npm install; npm run dev                                   # jogo
cd backend; .\.venv\Scripts\python.exe main.py runserver   # API
```
