# MagiClash — Networking e Multiplayer

## 1. Netlify + Vercel + Supabase bastam para realtime de 4 jogadores?

**Não.** Servem para tudo *em volta* da partida, mas não para a partida em si. Falta um
**servidor de jogo persistente com WebSocket (ou WebRTC/UDP) que rode o loop autoritativo**.

### Netlify
Hospedagem estática + functions serverless. Não mantém conexões nem processos longos.
Serve perfeitamente o bundle do jogo. **Não** serve como servidor de partida.

### Vercel (FastAPI serverless)
- Funções são efêmeras, com duração máxima limitada, escaladas horizontalmente em instâncias
  independentes e **sem memória compartilhada** entre invocações.
- O runtime Python da Vercel **não aceita upgrade de conexão para WebSocket** como servidor.
- Um loop de 60 Hz precisa de um processo vivo, com o estado da partida em memória e todos os 4
  jogadores conectados **na mesma instância**. Serverless é o oposto disso.

→ Vercel fica com as **APIs HTTP**: perfis, matchmaking (criação/pareamento de tickets), emissão
de *join tokens*, validação/gravação de resultados, leaderboard, avatar.

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
| Hospedagem | **Fly.io** (máquinas persistentes, WebSocket nativo, região `gru` São Paulo). Alternativas: Railway, Render, VPS Hetzner |
| Escala | 1 processo = N salas; 1 sala = 1 partida (2–4 jogadores). Fly Machines por região |
| Custo inicial | 1 máquina shared-cpu-1x (256–512 MB) aguenta dezenas de salas de 4 jogadores |

Por que não Python no game server? Seria preciso reescrever a simulação em Python e mantê-la
bit-a-bit igual à do cliente para predição/reconciliação funcionar. Com TypeScript nos dois lados
existe **uma** simulação.

## 2. Fluxo de uma partida online

```
Cliente ──POST /matchmaking/tickets──► API (Vercel) ──► Postgres (ticket, pareamento atômico
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

## 5. O que já está preparado na Fase 1

- Sim determinística, fixed-step 60 Hz, com input por bits (`InputFrame`) → serializável em 1 byte.
- Bot usa a mesma interface de input que um jogador remoto usaria.
- Eventos da sim separados da renderização (servidor poderá emitir os mesmos eventos).
- Teste de determinismo: duas simulações com a mesma seed e inputs produzem hash de estado idêntico.
