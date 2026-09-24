# MagiClash — Networking e Multiplayer

## 1. O que cada serviço consegue fazer

Hospedagem estática, funções serverless e o Realtime do Supabase servem para tudo *em volta* da
partida, mas não para a partida em si. Falta um **servidor de jogo persistente com WebSocket que
rode o loop autoritativo**. Decisão atual: API **e** game server no **Render** (dois web services,
`render.yaml`); Vercel e Fly.io foram descartados (Fly.io é pago).

### Netlify
Hospedagem estática + functions serverless. Não mantém conexões nem processos longos.
Serve perfeitamente o bundle do jogo. **Não** serve como servidor de partida.

### Funções serverless (ex.: Vercel) — por que não servem para a partida
- Funções são efêmeras, com duração máxima limitada, escaladas horizontalmente em instâncias
  independentes e **sem memória compartilhada** entre invocações.
- O runtime Python da Vercel **não aceita upgrade de conexão para WebSocket** como servidor.
- Um loop de 60 Hz precisa de um processo vivo, com o estado da partida em memória e todos os 4
  jogadores conectados **na mesma instância**. Serverless é o oposto disso.

→ Serverless só serviria para as APIs HTTP. Como o game server já precisa de um host com processo
persistente, a API FastAPI roda no mesmo provedor (Render), como um processo uvicorn comum.

### Supabase Realtime
- Broadcast/Presence são um **relay de mensagens pub/sub**. Não existe código nosso executando
  no meio do caminho → não há como ser autoritativo. Cada cliente simularia a própria verdade e
  qualquer cliente modificado decide dano/posição/vitória. Viola "never trust the client".
- Limites de mensagens por segundo por projeto/canal: 4 jogadores × 60 inputs/s + snapshots
  estouram facilmente os planos free/pro, e a latência passa por um hop extra.
- Edge Functions (Deno) têm limite de tempo de execução por invocação — impróprias para partidas
  de minutos.

→ Supabase Realtime **é útil** para coisas não-críticas: notificar "partida encontrada" ao ticket
de matchmaking, presença em lobby, chat de sala. Nunca para o estado de combate.

### Componente adicional necessário: Game Server realtime

| Item | Decisão |
|---|---|
| Linguagem | **Node.js + TypeScript**, importando `@magiclash/shared` (mesma simulação do cliente) |
| Transporte | WebSocket (`ws`) com mensagens binárias. WebRTC DataChannel (unreliable) como evolução |
| Hospedagem | **Render** web service Node (WebSocket nativo). Plano free: dorme após ~15 min sem tráfego (1º acesso leva ~1 min); sem região na América do Sul — `virginia` é a mais próxima (RTT ~120–150 ms do Brasil, a predição cobre) |
| Escala | 1 processo = N salas; 1 sala = 1 partida (2–4 jogadores). Salas e `jti` em memória → 1 instância |
| Custo inicial | Free (750 h/mês somadas entre os serviços; com sleep sobra). Plano pago evita o sleep |

Por que não Python no game server? Seria preciso reescrever a simulação em Python e mantê-la
bit-a-bit igual à do cliente para predição/reconciliação funcionar. Com TypeScript nos dois lados
existe **uma** simulação.

## 2. Fluxo de uma partida online

```
Cliente ──POST /matchmaking/tickets──► API (Render) ──► Postgres (ticket, pareamento atômico
   │                                                     com SELECT … FOR UPDATE SKIP LOCKED)
   │◄── Supabase Realtime: "ticket matched" (RLS: só o dono vê o próprio ticket)
   │
   ├──POST /matches/{id}/join──► API valida participante → emite JOIN TOKEN
   │                              (JWT curto, 60 s, assinado com segredo compartilhado API↔GS,
   │                               contém match_id, player_id, slot, character_id, server_url)
   │
   ├──WSS game-server?token=…──► GS verifica assinatura/expiração/uso único → sala
   │        inputs (bits) 60 Hz ──►
   │        ◄── snapshots 20–30 Hz + eventos
   │
   GS fim de partida ──POST /internal/matches/{id}/result (HMAC-SHA256 + timestamp + nonce)──► API
                        API: verifica assinatura, status da partida, participantes, coerência
                        (kos/deaths somam, duração plausível) → rating → grava com service role
```

O cliente **nunca** envia resultado. Não existe endpoint público de resultado.

## 3. Modelo de rede do combate (evolução em etapas)

"Primeiro funcional, depois evoluir":

| Etapa | Técnica | Quando |
|---|---|---|
| 5.1 | Servidor autoritativo, cliente envia **só inputs**, recebe snapshots e **interpola** todos (inclusive o próprio). Input delay perceptível, mas correto. | 1v1 privado |
| 5.2 | **Client-side prediction** do próprio lutador (roda `shared` localmente) + **reconciliation** (reaplica inputs não confirmados sobre o snapshot autoritativo). Remotos continuam interpolados ~100 ms atrás. | Matchmaking 1v1 |
| 5.3 | Input buffering no servidor (jitter buffer de 2–3 ticks), redundância de inputs (cada pacote leva os últimos N inputs), delta-compression de snapshots. | 4 jogadores |
| 5.4 | Latency compensation para hits: servidor avalia hitboxes de ataques contra hurtboxes rebobinadas até o tempo de visão do atacante (limitado a ~150 ms). | 2v2 / ranked |
| Futuro | Rollback netcode completo (GGPO-like) — viável porque a sim é determinística. | Se a sensação exigir |

Parâmetros iniciais:
- **Tick de simulação:** 60 Hz (igual ao cliente, mesmos frame data).
- **Snapshot rate:** 30 Hz (a cada 2 ticks); 20 Hz em fallback.
- **Input:** 1 byte de botões + número do tick; enviado todo tick com os 3 últimos inputs redundantes.
- **Interpolação:** buffer de ~100 ms (3 snapshots).

## 4. Anti-cheat server-side (Fase 5)

Como o cliente só manda bits de botão, **não existe como** mandar posição, dano ou cooldown.
Mesmo assim o GS registra (tabela `security_events`) e ignora:
- inputs com tick no futuro/passado além da janela;
- taxa de pacotes acima do limite (flood);
- sequências impossíveis (mais de 1 input por tick, ticks repetidos);
- desconexões/reconexões abusivas;
- resultados: API rejeita resultado incoerente (soma de KOs ≠ soma de mortes, duração < mínimo,
  participante inexistente, partida já finalizada → `SUSPICIOUS_MATCH`).

Sem ban automático durante desenvolvimento.

## 5. Implementação atual (Fase 5)

O diagrama da seção 2 é o desenho original; o que foi construído difere em alguns pontos:

| Peça | Como está |
|---|---|
| Identidade | Conta (token do Supabase) **ou** visitante: `POST /api/auth/guest` devolve token HS256 próprio (12 h, id `g_…`) |
| Entrar numa partida | `POST /api/rooms` (cria sala, código de 6 letras), `POST /api/rooms/{code}/join`, `POST /api/matchmaking/tickets` + `GET` (polling 1,5 s) + `DELETE` para cancelar |
| Join token | JWT HS256, **120 s**, `jti` de uso único (gravado em `match_entries` e checado pelo GS). Claims: `sub, kind, name, match, room, mode, stage, stocks, max_players, ranked` e, para contas com foto, `avatar` (caminho no bucket, validado por regex na API e no GS) |
| Conexão WS | `wss://…/ws` **sem token na URL**. Primeira mensagem: `{t:'auth', token, v}`. Timeout 5 s. Origin obrigatório e em allow-list; até 8 conexões por IP; `maxPayload` 1 KB; permessage-deflate |
| Lobby | `pick` (classe/cor), `team`, `ready`. Começa quando todos estão prontos (mín. 2) |
| Inputs | Cliente manda `{t:'in', s:seq, i:[últimos 4 inputs]}` a cada tick (redundância cobre perdas). Servidor aplica 1 por tick em fila (jitter buffer), ignora bits inválidos, marca saltos de `seq` > 5 s |
| Snapshots | 30 Hz (a cada 2 ticks), estado completo arredondado + `ack` (último `seq` aplicado daquele jogador) |
| Cliente | `Predictor` (shared): roda a própria sim, guarda inputs não confirmados e, a cada snapshot, adota o estado do servidor e reaplica os pendentes. Oponentes são extrapolados repetindo o último input conhecido. Correção visual suavizada. Ping (RTT) na tela |
| Abuso | Mensagens inválidas somam *strikes*; 20 → desconecta (4008). Taxa de mensagens limitada |
| Queda | Reconexão com novo join token pelo mesmo `sub` volta ao mesmo slot; após 15 s desconectado o jogador perde (forfeit) |
| Resultado | GS → `POST /api/internal/matches/{id}/result` com HMAC-SHA256 de `timestamp.body`, janela de 60 s, anti-replay; retries. API → `record_match_result` (valida participantes contra `match_entries`, KOs ≤ mortes, duração 10 s–15 min, idempotente) |

Teste local com latência: `SIMULATED_LATENCY_MS=60` no game server (só fora de produção; atrasa envio e
recepção, RTT ≈ 120 ms). A emulação de rede do DevTools **não** atrasa frames de WebSocket.
Validado com dois navegadores: ping exibido 127–129 ms, partida completa, resultado gravado.

## 6. O que já estava preparado na Fase 1

- Sim determinística, fixed-step 60 Hz, com input por bits (`InputFrame`) → serializável em 1 byte.
- Bot usa a mesma interface de input que um jogador remoto usaria.
- Eventos da sim separados da renderização (servidor poderá emitir os mesmos eventos).
- Teste de determinismo: duas simulações com a mesma seed e inputs produzem hash de estado idêntico.
