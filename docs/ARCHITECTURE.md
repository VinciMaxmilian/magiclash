# MagiClash — Arquitetura

> Documento da Fase 0. Cobre: arquitetura recomendada, escolha de engine, frontend, backend,
> estrutura de diretórios. Multiplayer em [NETWORKING.md](NETWORKING.md), banco em
> [DATABASE.md](DATABASE.md), segurança em [SECURITY.md](SECURITY.md), deploy em [DEPLOY.md](DEPLOY.md).

---

## 1. Visão geral

```
                     ┌──────────────────────────────┐
                     │  Navegador (Netlify, estático)│
                     │  Vite + TS + Phaser 3         │
                     │  ┌─────────────────────────┐  │
                     │  │ @magiclash/shared (sim) │  │  ← mesma simulação usada no servidor realtime
                     │  └─────────────────────────┘  │
                     └──┬───────────┬────────────┬───┘
            HTTPS (REST)│           │ WSS        │ supabase-js (auth + leituras públicas com RLS)
                        ▼           ▼            ▼
    ┌───────────────────────┐ ┌───────────────────────┐ ┌──────────────────────────┐
    │ API FastAPI (Render)  │ │ Game Server realtime  │ │ Supabase                 │
    │ stateless             │ │ Node/TS persistente   │ │ Postgres + RLS, Auth,    │
    │ perfis, matchmaking,  │ │ (Render, WebSocket)   │ │ Storage, Realtime        │
    │ leaderboard, results, │ │ autoritativo, 60 Hz   │ │                          │
    │ validação, rate limit │ │ roda @magiclash/shared│ │                          │
    └──────────┬────────────┘ └──────────┬────────────┘ └────────────▲─────────────┘
               │  service role (somente server)   │ resultado assinado (HMAC)  │
               └──────────────────────────────────┴──────► API ───────────────┘
```

Quatro peças, cada uma no lugar onde a infraestrutura é adequada:

| Peça | Hospedagem | Responsabilidade |
|---|---|---|
| Frontend | Netlify (CDN estática) | Renderização, input, UI, predição local |
| API HTTP | Render (mesmo container do game server, atrás do proxy `/api/*`) | Perfis, matchmaking, emissão de tokens de partida, validação e gravação de resultados, leaderboard, avatar upload |
| Game Server | Render (um web service Docker: Node público + FastAPI em loopback) | Loop autoritativo das partidas online via WebSocket |
| Dados | Supabase | Postgres + RLS, Auth, Storage, Realtime (notificações não-críticas) |

**Por que um game server separado?** Hospedagem estática (Netlify), funções serverless e o
Realtime do Supabase **não** rodam um loop autoritativo de 60 Hz com WebSockets abertos. É preciso
um processo Node sempre vivo — no Render ele divide o container com a API (`Dockerfile`).
Análise completa em [NETWORKING.md §1](NETWORKING.md#1-o-que-cada-servi%C3%A7o-consegue-fazer).

---

## 2. Engine / framework 2D

**Escolha: Phaser 3.90 (renderização/áudio/input/cenas) + simulação própria em TypeScript puro.**

| Opção | Prós | Contras |
|---|---|---|
| **Phaser 3** | Maduro, WebGL com fallback Canvas, modo `pixelArt`, cenas, câmeras, tweens, gamepad, loader, texture atlas. Documentação enorme. | Física Arcade não serve para platform fighter competitivo (não determinística o bastante, difícil de rodar no servidor). |
| Phaser 4 (4.2) | Renderer novo | API mudou (tint, pipelines); ecossistema e exemplos ainda migrando. Risco desnecessário agora. |
| PixiJS | Só renderização, leve | Teríamos que construir cenas, input, áudio, loader. |
| Godot/Unity Web | Editor completo | Bundle grande, não reaproveita a simulação num servidor Node, pior integração web. |

**Decisão central:** o Phaser **não** executa a lógica de jogo. Toda a simulação (física, combate,
hitboxes, estados, IA) vive em `shared/` como TypeScript puro, sem DOM e sem Phaser:

- roda num **fixed timestep de 60 Hz**, independente do FPS do monitor;
- recebe apenas `InputFrame`s (bits de botões) e devolve estado + eventos;
- é **determinística** (RNG com seed, sem `Math.random`, sem `Date.now`);
- pode ser executada **headless** no Node — o Game Server da Fase 5 importa exatamente o mesmo código
  que o cliente usa para predição. Isso elimina a divergência "cliente acha X, servidor acha Y"
  causada por duas implementações da física.

O Phaser apenas lê o estado da simulação e desenha (com interpolação entre ticks).

A migração para Phaser 4 fica registrada no roadmap como opcional, e afeta só `frontend/src/game/render`.

---

## 3. Arquitetura do frontend

```
frontend/src/
  main.ts                  bootstrap Phaser, escala inteira pixel-perfect
  config/                  constantes de build/ambiente (DEV flags, URLs públicas)
  game/
    scenes/                Boot, Title, Match, Results (UI Phaser)
    render/                FighterView, StageView, gerador procedural de sprites (placeholder)
    effects/               EffectManager: sparks, slashes, poeira, trails, shake, hit-flash
    audio/                 AudioManager com buses (master/music/sfx/ui/ambient), SFX sintetizados, música chiptune (sequenciador)
    input/                 InputManager + adaptadores (teclado, gamepad, touch)
    maps/                  StageArt por mapa (camadas, parallax, animações)
    debug/                 overlay de hitbox/hurtbox/estado/FPS — carregado só em DEV
  ui/                      fonte bitmap, painéis, HUD
  services/                (Fase 4+) cliente API, supabase-js com chave anon
```

Fluxo por frame de tela (`MatchScene.update`):

1. `InputManager.sample()` → `InputFrame` do jogador local (latched: um toque de < 16 ms não se perde).
2. `BotController.think()` → `InputFrame` do bot (bot usa **a mesma interface** de input — não trapaceia).
3. `accumulator += dt`; enquanto `accumulator ≥ 1/60`: `sim.step(inputs)` → eventos.
4. Eventos (`hit`, `ko`, `jump`, `land`, `attack_start`, ...) disparam efeitos e sons.
5. Render interpola `prev`/`curr` por `alpha` e arredonda para pixel inteiro.

## 4. Arquitetura do backend

FastAPI stateless (uvicorn no Render). Organização:

```
backend/
  app/
    main.py                create_app(): middlewares, routers, handlers
    core/config.py         Settings (pydantic-settings, lidas do ambiente)
    core/logging.py        log estruturado JSON + redaction de segredos/tokens
    security/              headers, CORS, rate limit, auth (JWT Supabase), assinatura HMAC do game server
    api/                   routers: health, profiles, online (guest, salas, fila), internal (resultado), leaderboard
    schemas/               modelos Pydantic de entrada/saída (validação estrita, extra=forbid)
    services/              regras de negócio (rating, validação de resultado)
    repositories/          acesso ao Supabase (service role — só aqui)
  tests/
```

Princípios:
- **Nada de estado em memória entre requests** (instâncias serverless são efêmeras e múltiplas).
  Rate limiting e idempotência persistem no Postgres ou num KV (Upstash) — ver SECURITY.md.
- Toda entrada é validada por schema com `extra="forbid"` e limites de tamanho.
- A service role key existe **apenas** em variáveis de ambiente do backend e do game server.

## 5. Estrutura de diretórios (monorepo)

```
magiclash/
  package.json             npm workspaces: shared, frontend (realtime entra na Fase 5)
  netlify.toml             build + headers de segurança do frontend
  shared/                  @magiclash/shared — simulação determinística (TS puro)
    src/
      core/                math, rng, tipos, constantes de tick
      physics/             corpos AABB, colisão com plataformas sólidas/one-way
      combat/              frame data runtime, hitboxes, knockback, hitstun, hitstop
      characters/          tipos CharacterDefinition/AttackDefinition + validação
      data/                *dados* de balanceamento: characters/knight.ts, stages/castle-courtyard.ts
      ai/                  BotController (máquina de estados) + perfis de dificuldade
      sim/                 Simulation: step(), eventos, regras de partida (stocks, timer)
    tests/                 vitest: física, dano, knockback, cooldown, exploits, bot vs bot
  frontend/                Vite + Phaser (ver §3)
  backend/                 FastAPI (ver §4) + .venv local
  realtime/                (Fase 5) game server Node/TS — hoje só README com o desenho
  supabase/
    migrations/            SQL versionado (schema + RLS)
    policies/              documentação/testes das policies
    seeds/
  docs/
  CONTINUAR.md
```

Melhorias sobre o exemplo do PLAN.md:
- `shared/` separado do `frontend/`, para o servidor realtime reaproveitar a simulação sem puxar Phaser.
- `data/` separado de `combat/`: balanceamento é só dado, sem mexer no código central.
- `render/` separado de `entities/`: não existem "entidades Phaser com lógica"; existem
  *views* que desenham estado.
- `realtime/` como deploy independente (Fase 5).
