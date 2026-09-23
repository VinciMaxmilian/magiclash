# CONTINUAR — memória técnica do MagiClash

> Atualize ao fim de cada etapa grande. Última atualização: 2026-09-23 (fim da Fase 4).

## Estado atual

Fases **0–4 concluídas** e verificadas (testes + navegador real via Chrome headless).

- **Jogo** (`frontend/`, Phaser 3.90): título → seleção (6 classes × 4 cores, 1–3 bots, FFA/2v2,
  3 mapas, vidas) → partida → resultados. Tela cheia (escala FIT 16:9, tecla F). Pausa com
  reiniciar/trocar personagem. Debug (F1) e câmera lenta (F2) só em DEV.
- **Simulação** (`shared/`): determinística 60 Hz, física AABB, combate por dano acumulado,
  projéteis (trajetória, cravar, explosão, perfuração, re-hit, anexados, no chão), carga,
  lentidão, desarme do Bárbaro, 4 lutadores, times, bots com 3 dificuldades.
- **Backend** (`backend/`, FastAPI): health, perfis (`GET/PATCH /api/profiles/me`,
  `GET /api/profiles/{username}`), upload de avatar validado e re-encodado. Headers, CORS,
  rate limit, limite de corpo, logs com redaction. `python main.py runserver` / `python main.py test`.
- **Supabase** (projeto `magiclash`, `cvflnhkaelgsdjrgkkfu`, sa-east-1): 2 migrations aplicadas
  (`supabase/migrations/`), RLS deny-by-default verificado por testes de integração reais.
- **Contas**: login/registro email+senha (Supabase Auth), perfil (nome, favorito, avatar padrão
  ou imagem), visitante com nome temporário.

## Como rodar

```powershell
npm install
npm run dev                                   # jogo: http://localhost:5173
cd backend; .\.venv\Scripts\python.exe main.py runserver    # API: http://localhost:8000
```
Env: `backend/.env` (segredos, git-ignored) e `frontend/.env.local` (só valores públicos).

## Testes

| Comando | O quê |
|---|---|
| `npm test` | 70+ testes vitest: física, combate, exploits, classes, projéteis, bots, contrato dados↔assets |
| `npm run typecheck` | TS estrito shared + frontend |
| `cd backend; .\.venv\Scripts\python.exe main.py test` | 52 testes pytest: segurança, perfis (fake), avatar |
| `SUPABASE_IT=1 … pytest tests/test_supabase_integration.py` | 8 testes de RLS no Supabase real (cria/apaga usuários) |
| `STATS_OUT=arquivo npm run sim:balance` | matriz de balanceamento bot×bot |
| `ART_PREVIEW_DIR=pasta npx vitest run frontend/tests/art.preview.test.ts` | PNGs da arte procedural para revisão |

## Decisões tomadas (resumo — detalhes em docs/)

1. Phaser só renderiza; simulação é TS puro em `shared/` (reutilizada pelo futuro servidor).
2. Vercel não serve para o loop realtime → **game server Node/TS separado (Fly.io)** na Fase 5.
3. Arte da Fase 1–4 é **procedural** (pixel puppets com proporção fixa, paleta única). Nenhum
   asset de IA entrou no jogo. Frames têm nomes estáveis para troca pela arte final.
4. Escala: FIT preenchendo a janela (pedido do usuário), nearest-neighbour.
5. `__DEV_TOOLS__` (modo do Vite) em vez de `import.meta.env.DEV`: a máquina tem
   `NODE_ENV=development` global, que vazava ferramentas de debug no build.
6. Validação de token no backend via `GET /auth/v1/user` (autoritativo, cobre revogação), com cache de 60 s.
7. Stats/rating só podem ser escritos pelo backend (sem policies de escrita + REVOKE).

## Bugs / pendências conhecidas

- `sb_secret_…` fornecida é recusada ("Unregistered API key"); usando o JWT legado service_role.
  **Rotacionar chaves** antes de produção (foram compartilhadas em chat).
- Registro pela UI depende da confirmação de email do Supabase (mensagem exibida).
- Autodestruições dos bots ainda ~0,3/partida em hard; ok para bots, refinar depois.

## Próximos passos

Fase 5 — ver [docs/ROADMAP.md](docs/ROADMAP.md).
