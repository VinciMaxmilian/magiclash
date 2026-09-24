# MagiClash — Segurança

Modelo: **Never trust the client.** Todo código do navegador é considerado controlado pelo atacante:
JavaScript modificável, requests forjáveis, DevTools aberto.

## 1. Modelo de autenticação

| Tipo | Como | Pode |
|---|---|---|
| **Visitante (guest)** | Nenhuma conta. Singleplayer é 100% local. Para online, `POST /auth/guest` (rate-limited por IP, com captcha Turnstile na Fase 5) emite **guest token** JWT assinado pelo backend, 12 h, `role=guest`, nome temporário validado | singleplayer, filas casuais |
| **Conta** | Supabase Auth email/senha (confirmação de email ligada). Cliente usa só a **anon key** (pública por design). Backend valida o JWT do Supabase (JWKS / assinatura, `aud`, `exp`, `iss`) | tudo + ranking, perfil, histórico |
| **Game Server** | Segredo compartilhado com o backend (env), usado para assinar join tokens e resultados (HMAC-SHA256 + timestamp + nonce) | reportar resultado |
| **Backend** | Service role key (env da Vercel). Nunca sai do servidor | escrever dados competitivos |

OAuth (Google/Discord) é só habilitar provedores no Supabase Auth: o backend valida JWT do
Supabase independente do provedor, e `profiles` é criado por trigger em `auth.users`.

## 2. Ameaças e mitigação

| Ataque | Mitigação |
|---|---|
| Falsificar resultado (`{"winner":"me"}`) | Não existe endpoint público de resultado. Só o Game Server reporta, assinado por HMAC; API valida coerência e idempotência |
| Modificar velocidade/cooldown/teleportar via JS | Online: servidor autoritativo roda a simulação e só aceita bits de input. Offline: não afeta ninguém (sem ranking) |
| Duplicar requests | Idempotency key + status da partida (`finished` não aceita outro resultado); nonce de assinatura com janela de 60 s |
| Manipular IDs / acessar dados de outros | RLS com `auth.uid()`; backend deriva o usuário **do token**, nunca do corpo do request |
| Alterar rating/vitórias via supabase-js | Sem policies de escrita nessas tabelas; column privileges em `profiles` |
| Abusar das APIs | Rate limit por IP + por usuário (token bucket persistido em Upstash/Postgres — memória de instância serverless não é confiável), limite de corpo (64 KB), timeouts |
| Payload malicioso | Pydantic `extra="forbid"`, tipos/limites estritos, username por regex `^[A-Za-z0-9_]{3,16}$`, sem HTML renderizado sem escape |
| Upload malicioso | Via backend: limite 512 KB, magic bytes, extensão, re-encode para WebP, nome UUID, bucket com `allowed_mime_types` |
| XSS | CSP estrita no Netlify (`script-src 'self'`), UI do jogo renderizada no canvas, textos do usuário nunca em `innerHTML` |
| Vazamento de segredo | Frontend só recebe variáveis `VITE_*` que são públicas por definição (URL + anon key). `.env` no `.gitignore` |

## 3. Headers e CORS

- Netlify (`netlify.toml`): `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  `Permissions-Policy`, `Strict-Transport-Security`.
- FastAPI: middleware adiciona os mesmos headers de segurança às respostas da API; CORS com
  **lista explícita** de origens (`ALLOWED_ORIGINS`), nunca `*` com credenciais.

## 4. Logs

Eventos: `MATCH_CREATED, MATCH_STARTED, MATCH_FINISHED, PLAYER_JOINED, PLAYER_LEFT, INVALID_ACTION,
RATE_LIMIT, AUTH_FAILURE, SUSPICIOUS_MATCH`. JSON estruturado. O formatter **redige** campos
sensíveis (`password`, `token`, `access_token`, `refresh_token`, `authorization`, `secret`,
`apikey`) e qualquer string com cara de JWT. Erros para o cliente são genéricos + `request_id`;
detalhes ficam só no log.

## 5. Debug em produção

O overlay de debug (hitboxes, estado, FPS, ping) é importado via `import.meta.env.DEV`; em build
de produção o módulo nem entra no bundle. No online o overlay mostra o que o cliente *recebe*,
então não dá vantagem que já não exista.

## 6. Estado atual (Fase 5)

Implementado e testado:
- Backend: headers, CORS restritivo, limite de corpo (com override só para avatar), rate limit
  global + por usuário em escritas, logs com redaction, erros sem eco de input, docs off em produção.
- Auth: token validado pelo Supabase Auth (`/auth/v1/user`), id do usuário vem **só** do token;
  cache de 60 s por hash do token.
- Perfis: schema estrito (`extra=forbid`), nomes reservados, username único (409), sem IDOR.
- Avatar: 512 KB, extensão + magic bytes + decode real + limite de pixels + re-encode WebP + nome
  aleatório; SVG/EXE/polyglot rejeitados (testes).
- Supabase: RLS deny-by-default, REVOKE de escrita em dados competitivos, column privileges em
  `profiles`, helper de RLS fora do schema exposto, bucket sem upload de cliente (testes reais).
- Frontend: só chave pública; inputs HTML não recebem atalhos do jogo.

- Online: join token de uso único (120 s) com claims validados por regex no GS; `alg` fixo HS256
  (`none` rejeitado em teste); auth na primeira mensagem (token fora de URLs/logs); allow-list de Origin;
  limite de conexões por IP, de tamanho e de taxa de mensagens; strikes.
- Cliente só envia bits de botão; o GS ignora bits fora da máscara e nunca aceita estado do cliente.
- Resultado só pelo GS, com HMAC + timestamp + anti-replay; `record_match_result` só executável pela
  service role e valida tudo de novo no banco.
- Foto no HUD online: o GS só repassa um **caminho** do bucket (regex `uuid/hex32.webp`), a URL é montada
  pelo cliente com o `VITE_SUPABASE_URL` — nenhuma URL arbitrária vinda da rede é carregada.

Pendente: captcha no visitante online, rate limit compartilhado entre instâncias, `jti` em store
compartilhado quando houver várias máquinas do GS.
