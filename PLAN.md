# MAGICLASH — JOGO WEB MULTIPLAYER 2D PIXEL ART

Quero que você projete e desenvolva um jogo web chamado **MagiClash**.

MagiClash será um jogo de combate em plataformas 2D inspirado conceitualmente em jogos como Brawlhalla, mas deverá possuir **identidade visual, personagens, mapas, animações, efeitos, interface, mecânicas e assets próprios**.

Não copie personagens, mapas, sprites, animações, interface, sons, nomes, ícones ou assets de Brawlhalla ou de qualquer outro jogo.

A inspiração deve ficar restrita ao conceito geral de:

- platform fighter;
- movimentação rápida;
- arenas 2D;
- combate baseado em posicionamento;
- ataques direcionais;
- partidas curtas;
- multiplayer competitivo.

O resultado deve parecer um jogo independente próprio.

---

# 1. STACK

O projeto deverá utilizar:

## Frontend

- Vite
- JavaScript ou TypeScript
- HTML5
- CSS
- Canvas/WebGL quando apropriado
- Preferencialmente Phaser 3 ou outra biblioteca leve adequada para jogos 2D web

Deploy:

**Netlify**

## Backend

- Python
- FastAPI

Deploy:

**Vercel**

O backend será responsável principalmente por:

- autenticação complementar;
- perfis;
- leaderboard;
- matchmaking;
- gerenciamento de partidas;
- validação de resultados;
- APIs;
- segurança;
- integração com Supabase.

IMPORTANTE:

Antes de implementar multiplayer em tempo real, analise as limitações de execução serverless da Vercel.

Não tente forçar uma arquitetura de WebSocket persistente em uma infraestrutura inadequada.

Caso Vercel não seja apropriada para o servidor autoritativo das partidas, mantenha nela as APIs HTTP e proponha uma arquitetura separada para o servidor realtime.

Explique a decisão antes de implementá-la.

## Banco de dados

Utilizar:

**Supabase**

Usar quando apropriado:

- PostgreSQL
- Supabase Auth
- Supabase Storage
- Row Level Security
- Realtime

## Assets

Tenho conectores disponíveis no Claude Desktop/Claude Code para:

- Supabase
- Netlify
- Vercel
- Higgsfield

Utilize esses conectores quando necessário.

O Higgsfield poderá ser utilizado para auxiliar na criação de:

- conceitos visuais;
- texturas;
- backgrounds;
- sprites de referência;
- efeitos;
- elementos ambientais;
- sons;
- outros assets.

Porém, todos os assets gerados devem passar por uma etapa de curadoria.

**Não coloque automaticamente no jogo qualquer asset produzido por IA.**

---

# 2. DIREÇÃO ARTÍSTICA

MagiClash deverá utilizar:

**2D Pixel Art Medieval Fantasy**

Referências conceituais:

- castelos;
- florestas;
- vilas;
- ruínas;
- fortalezas;
- torres;
- cavernas;
- templos;
- montanhas;
- arenas mágicas.

Quero pixel art de alta qualidade.

Evitar completamente aparência de:

- AI Slop;
- imagens excessivamente genéricas;
- assets inconsistentes;
- personagens com proporções diferentes entre frames;
- iluminação incoerente;
- elementos borrados;
- pseudo-pixel-art;
- excesso de partículas;
- interfaces genéricas produzidas por IA.

Defina uma linguagem visual consistente antes de produzir assets.

Crie regras para:

- resolução base;
- tamanho dos sprites;
- tamanho dos pixels;
- proporções;
- paleta;
- iluminação;
- outline;
- sombras;
- animações;
- partículas;
- UI.

Todos os personagens devem parecer pertencer ao mesmo universo.

---

# 3. PERSONAGENS

Inicialmente existirão quatro classes principais.

Cada classe deverá possuir:

- identidade visual;
- atributos próprios;
- velocidade;
- peso;
- alcance;
- dano;
- recuperação;
- ataques direcionais;
- efeitos;
- animações;
- vantagens;
- desvantagens.

Não quero apenas diferenças cosméticas.

As classes precisam alterar significativamente a maneira de jogar.

---

## CAVALEIRO

Visual:

- armadura medieval;
- espada;
- aparência robusta;
- animações pesadas.

Combate:

**curta e média distância**

Ataques:

- corte frontal;
- combo de espada;
- ataque para cima;
- golpe pesado;
- avanço com espada;
- ataque aéreo.

Características:

- resistência alta;
- velocidade média;
- alcance médio;
- bom controle terrestre.

---

## BÁRBARO

Visual:

- roupas de bárbaro;
- machado;
- aparência forte;
- animações agressivas.

Combate:

**curta e longa distância**

Ataques:

- golpe frontal de machado;
- ataque vertical;
- ataque giratório;
- golpe pesado;
- arremesso de machado.

O machado arremessado deverá possuir comportamento próprio.

Considere:

- trajetória;
- velocidade;
- colisão;
- dano;
- recuperação;
- cooldown.

Características:

- dano alto;
- ataques mais lentos;
- resistência alta;
- mobilidade média/baixa.

---

## ARQUEIRO

Visual:

- roupa medieval;
- capuz.

Permitir inicialmente variações:

- verde;
- azul;
- amarelo;
- vermelho.

Arma:

**arco e flecha**

Combate:

**média e longa distância**

Ataques:

- disparo frontal;
- disparo para cima;
- disparo aéreo;
- disparo carregado;
- ataque rápido próximo;
- possibilidade futura de flechas especiais.

Características:

- alta mobilidade;
- grande alcance;
- resistência menor;
- depende de posicionamento.

---

# 4. MAGOS

Criar três especializações.

## MAGO DE FOGO

Visual:

- roupa de mago;
- chapéu;
- cajado;
- esfera de fogo no cajado.

Ataques possíveis:

- fireball;
- explosão próxima;
- coluna de fogo;
- ataque aéreo;
- projétil carregado.

Efeitos:

- brasas;
- pequenas distorções;
- partículas;
- explosões;
- iluminação dinâmica quando possível.

---

## MAGO DE GELO

Visual:

- tons frios;
- cajado;
- esfera de gelo.

Ataques:

- projétil de gelo;
- rajada curta;
- espinhos de gelo;
- ataque vertical;
- ataque carregado.

Efeitos:

- cristais;
- partículas congeladas;
- fragmentos;
- névoa fria.

---

## MAGO DE RAIO

Visual:

- cajado;
- esfera elétrica.

Ataques:

- descarga elétrica;
- raio frontal;
- ataque vertical;
- arco elétrico;
- ataque carregado.

Efeitos:

- flashes;
- pequenos arcos elétricos;
- partículas;
- iluminação rápida.

---

# 5. SISTEMA DE COMBATE

O combate deve ser simples de aprender, mas permitir domínio mecânico.

Implementar suporte para:

- movimento esquerda/direita;
- pulo;
- queda rápida;
- ataques terrestres;
- ataques aéreos;
- ataque frontal;
- ataque para cima;
- ataques de curto alcance;
- ataques de médio alcance;
- ataques de longo alcance;
- esquiva;
- knockback;
- hitstun;
- recuperação;
- cooldown;
- combos;
- colisão;
- plataformas.

Evite que combate seja determinado apenas por HP.

Estude um sistema baseado em:

**dano acumulado + knockback progressivo**

Quanto mais dano um jogador acumular, maior poderá ser a força com que determinados golpes o lançam.

A eliminação poderá acontecer quando o personagem sair dos limites da arena.

A arquitetura deve permitir balanceamento posterior sem alterar o código central.

Crie dados configuráveis para:

- dano;
- knockback;
- velocidade;
- cooldown;
- alcance;
- hitbox;
- hurtbox;
- startup;
- active frames;
- recovery frames.

---

# 6. HITBOXES

Não basear combate exclusivamente na colisão visual dos sprites.

Implementar:

- hurtboxes;
- hitboxes;
- projectile hitboxes;
- environmental collision.

Criar ferramentas de debug capazes de mostrar:

- hitboxes;
- hurtboxes;
- posição;
- velocidade;
- colisões;
- estado atual;
- ping;
- FPS.

Esses recursos deverão ser desativados em produção.

---

# 7. MODOS

## SINGLEPLAYER

Permitir jogar contra bots.

Bots devem possuir níveis de dificuldade.

Inicialmente:

- Fácil
- Médio
- Difícil

Bots devem conseguir:

- movimentar;
- pular;
- perseguir;
- fugir;
- reconhecer perigo;
- atacar;
- usar ataques direcionais;
- evitar cair da arena;
- tentar recuperar quando lançados para fora.

Não utilizar simplesmente input aleatório.

Criar máquina de estados ou comportamento equivalente.

---

# 8. MULTIPLAYER

Máximo inicial:

**4 jogadores**

Modos:

### FREE-FOR-ALL

Todos contra todos.

### TIMES

Inicialmente:

**2v2**

Preparar arquitetura para outros modos posteriormente.

---

# 9. NETWORKING

Este ponto é crítico.

O jogo não deve confiar no cliente para determinar:

- dano;
- vitória;
- posição final;
- kills;
- ranking;
- resultados;
- cooldown;
- ataques válidos.

Nunca permita algo equivalente a:

```text
POST /match/result
{
    "winner": "me"
}
```

ser aceito simplesmente porque o cliente informou o resultado.

Para multiplayer competitivo, projetar arquitetura **server-authoritative** sempre que tecnicamente viável.

Estudar:

- snapshots;
- interpolation;
- client prediction;
- reconciliation;
- input buffering;
- tick rate;
- latency compensation.

Não implementar complexidade desnecessária inicialmente.

Primeiro criar uma versão funcional.

Depois evoluir o networking.

---

# 10. MATCHMAKING

Fluxo:

PLAY

→ escolher modo

→ escolher personagem

→ matchmaking

→ lobby

→ partida

→ resultado

→ atualização de estatísticas.

Criar também suporte futuro para:

- sala privada;
- código da sala;
- jogar com amigos;
- espectador.

---

# 11. CONVIDADOS

Usuário poderá jogar sem conta.

Guest deverá poder:

- escolher nome temporário;
- selecionar personagem;
- jogar singleplayer;
- jogar modos online permitidos.

Porém não deverá possuir necessariamente:

- ranking persistente;
- histórico permanente;
- perfil completo.

---

# 12. CONTAS

Usuário poderá criar conta.

Utilizar Supabase Auth.

Suportar inicialmente:

- email/senha.

Preparar arquitetura para posteriormente adicionar:

- Google;
- Discord;
- outros provedores.

Perfil deverá possuir:

- username;
- avatar;
- personagem favorito;
- partidas;
- vitórias;
- derrotas;
- eliminações;
- mortes;
- ranking;
- data de criação.

---

# 13. AVATAR

Permitir:

- escolher avatar padrão;
- futuramente enviar imagem própria.

Uploads deverão possuir:

- limite de tamanho;
- validação MIME;
- validação de extensão;
- nomes aleatórios;
- proteção contra arquivos executáveis;
- bucket configurado corretamente.

---

# 14. LEADERBOARD

Criar leaderboard global.

Exibir:

- posição;
- jogador;
- avatar;
- rating;
- vitórias;
- derrotas;
- partidas.

Não confiar no frontend para atualizar ranking.

Ranking deverá ser calculado/validado pelo servidor.

Estruturar para futuramente suportar:

- ranking global;
- ranking semanal;
- ranking mensal;
- ranking por personagem;
- temporadas.

---

# 15. MAPAS

Criar arenas medievais.

Primeiros conceitos:

### Castle Courtyard

Pátio de um castelo medieval.

### Enchanted Forest

Floresta mágica.

### Wizard Tower

Torre de magos.

### Ancient Ruins

Ruínas antigas.

### Frozen Fortress

Fortaleza congelada.

### Volcanic Keep

Fortaleza próxima de lava.

Cada mapa poderá possuir:

- background;
- foreground;
- plataformas;
- elementos animados;
- partículas;
- iluminação;
- ambientação própria.

Porém os elementos visuais não devem prejudicar a leitura dos personagens.

---

# 16. EFEITOS

Este é um ponto importante do projeto.

Quero efeitos visualmente satisfatórios.

Criar:

- hit sparks;
- slash effects;
- trails;
- impacto;
- poeira;
- partículas;
- fogo;
- gelo;
- eletricidade;
- pequenas explosões;
- screen shake;
- flash de impacto;
- knockback trails.

Porém:

**clareza de gameplay > quantidade de efeitos.**

Evitar poluição visual.

Ataques devem transmitir peso através da combinação de:

- animação;
- partículas;
- som;
- hit-stop;
- screen shake;
- knockback.

---

# 17. ÁUDIO

Criar sistema separado para:

- música;
- efeitos;
- UI;
- ambiente.

Efeitos necessários:

- espada;
- machado;
- arco;
- flecha;
- fogo;
- gelo;
- raio;
- pulo;
- aterrissagem;
- impacto;
- morte;
- UI.

Adicionar configurações:

- Master Volume
- Music Volume
- SFX Volume

---

# 18. INTERFACE

Criar UI coerente com:

**Medieval Fantasy + Pixel Art**

Telas:

- Loading
- Home
- Play
- Character Select
- Matchmaking
- Lobby
- Game
- Results
- Login
- Register
- Profile
- Leaderboard
- Settings

Evitar dashboards genéricos.

A interface precisa parecer parte de um jogo.

---

# 19. SEGURANÇA

Segurança é prioridade.

Considere que usuários tentarão:

- alterar requests;
- modificar JavaScript;
- alterar valores pela DevTools;
- falsificar resultados;
- modificar velocidade;
- remover cooldown;
- teleportar;
- duplicar requests;
- manipular IDs;
- acessar dados de outros jogadores;
- abusar das APIs;
- enviar payloads maliciosos.

Adotar modelo:

**Never trust the client.**

Implementar:

- validação server-side;
- autorização;
- RLS;
- rate limiting;
- sanitização;
- validação de payload;
- limites de tamanho;
- proteção de endpoints;
- logs;
- tratamento seguro de erros;
- secrets apenas no servidor;
- CORS restritivo;
- headers de segurança.

Nunca colocar no frontend:

- Supabase service role key;
- secrets;
- tokens administrativos;
- chaves privadas.

Utilizar apenas chaves que sejam explicitamente seguras para exposição pública no navegador.

---

# 20. SUPABASE SECURITY

Usar RLS **deny-by-default**.

Criar policies explicitamente.

Um usuário nunca poderá simplesmente alterar:

- rating;
- vitórias;
- derrotas;
- resultados;
- estatísticas;
- perfil de outro jogador.

Separar informações públicas de informações privadas.

Criar migrations versionadas.

Não modificar banco manualmente sem registrar a alteração.

---

# 21. ANTI-CHEAT

Não tente criar anti-cheat invasivo no navegador.

Em vez disso, criar mecanismos server-side para detectar estados impossíveis.

Exemplos:

- velocidade impossível;
- ataques rápidos demais;
- cooldown impossível;
- dano impossível;
- teleportes;
- inputs incompatíveis;
- sequência impossível de ações;
- resultados inconsistentes.

Registrar eventos suspeitos.

Não banir automaticamente durante desenvolvimento.

---

# 22. PERFORMANCE

O jogo deverá funcionar bem em navegadores modernos.

Meta inicial:

**60 FPS**

Otimizar:

- sprites;
- spritesheets;
- partículas;
- física;
- áudio;
- carregamento;
- requests;
- bundles.

Utilizar:

- lazy loading;
- asset caching;
- texture atlases;
- object pooling quando necessário.

Evitar assets gigantes.

---

# 23. RESPONSIVIDADE

Desktop será inicialmente a plataforma principal.

Porém preparar arquitetura para posteriormente suportar:

- mobile;
- touchscreen;
- gamepad.

Criar um sistema abstrato de inputs:

InputManager

que permita mapear:

- teclado;
- gamepad;
- touch.

Não amarrar lógica do personagem diretamente às teclas.

---

# 24. ESTRUTURA DO PROJETO

Quero arquitetura modular.

Exemplo conceitual:

```text
magiclash/

frontend/
  src/
    game/
      scenes/
      entities/
      characters/
      combat/
      physics/
      networking/
      effects/
      audio/
      ai/
      maps/
      input/
    ui/
    services/
    assets/
    config/

backend/
  app/
    api/
    auth/
    matchmaking/
    matches/
    leaderboard/
    security/
    models/
    schemas/
    services/

supabase/
  migrations/
  policies/
  seeds/

docs/

tests/
```

Você pode melhorar essa arquitetura.

---

# 25. CONFIGURAÇÃO DOS PERSONAGENS

Evite hardcode.

Criar configuração equivalente a:

```text
CharacterDefinition

id
name
class
health
weight
moveSpeed
jumpForce
airControl

attacks[]

AttackDefinition

id
direction
damage
knockback
startup
active
recovery
cooldown
range
hitbox
effect
sound
```

Assim novos personagens poderão ser adicionados posteriormente.

---

# 26. TESTES

Criar testes desde o início.

Backend:

- pytest

Testar:

- autenticação;
- autorização;
- APIs;
- leaderboard;
- resultados;
- validações;
- segurança.

Frontend/game:

testar quando possível:

- cálculos;
- estados;
- cooldown;
- dano;
- knockback;
- configuração.

Criar também testes específicos contra exploits óbvios.

---

# 27. LOGS

Backend deverá registrar eventos relevantes.

Exemplos:

```text
MATCH_CREATED
MATCH_STARTED
MATCH_FINISHED
PLAYER_JOINED
PLAYER_LEFT
INVALID_ACTION
RATE_LIMIT
AUTH_FAILURE
SUSPICIOUS_MATCH
```

Nunca registrar:

- senha;
- access token completo;
- refresh token;
- secrets.

---

# 28. DOCUMENTAÇÃO

Criar `/docs`.

Documentar:

```text
ARCHITECTURE.md
GAMEPLAY.md
COMBAT.md
NETWORKING.md
DATABASE.md
SECURITY.md
ASSETS.md
DEPLOY.md
ROADMAP.md
```

Também criar:

```text
CONTINUAR.md
```

Esse arquivo deverá funcionar como memória técnica do projeto.

Registrar nele:

- estado atual;
- última implementação;
- decisões tomadas;
- bugs conhecidos;
- próximos passos;
- mudanças arquiteturais importantes.

Atualize-o ao final de cada grande etapa.

---

# 29. WORKFLOW COM ASSETS

Antes de gerar dezenas de imagens, defina:

**MagiClash Art Bible**

Ela deverá estabelecer:

- resolução;
- proporção;
- paleta;
- iluminação;
- outlines;
- escala;
- tamanho de personagens;
- tamanho de tiles;
- estilo das animações;
- regras para partículas.

Somente depois comece a gerar assets.

Para cada asset produzido por IA:

1. gerar;
2. avaliar;
3. corrigir inconsistências;
4. adequar à Art Bible;
5. otimizar;
6. integrar.

Se estiver visualmente ruim:

**não use.**

É preferível utilizar placeholder temporário.

---

# 30. DESENVOLVIMENTO POR FASES

Não tente construir tudo simultaneamente.

## FASE 0 — PLANEJAMENTO

Primeiro:

- analisar requisitos;
- analisar stack;
- decidir engine/framework;
- analisar multiplayer;
- definir arquitetura;
- definir banco;
- definir modelo de segurança;
- criar Art Bible;
- criar documentação inicial.

Não começar produzindo dezenas de arquivos aleatórios.

---

## FASE 1 — VERTICAL SLICE

Criar primeiro uma versão local mínima:

**1 mapa + Cavaleiro + 1 bot**

Implementar:

- movimentação;
- câmera;
- plataformas;
- colisão;
- pulo;
- ataques;
- hitboxes;
- dano;
- knockback;
- eliminação;
- respawn;
- efeitos básicos;
- HUD.

Objetivo:

**provar que o combate é divertido.**

---

## FASE 2 — CLASSES

Adicionar:

- Bárbaro
- Arqueiro
- Mago de Fogo
- Mago de Gelo
- Mago de Raio

Balancear aproximadamente.

---

## FASE 3 — SINGLEPLAYER

Criar:

- bots;
- dificuldades;
- seleção de personagem;
- seleção de mapa;
- resultado.

---

## FASE 4 — CONTAS

Implementar:

- Supabase Auth;
- perfil;
- avatar;
- username;
- estatísticas.

---

## FASE 5 — MULTIPLAYER

Criar inicialmente:

**1v1 privado**

Depois:

**2 jogadores matchmaking**

Depois:

**4 jogadores**

Depois:

**2v2**

Não comece diretamente com 4-player networking se uma arquitetura menor ainda não foi validada.

---

## FASE 6 — LEADERBOARD

Adicionar:

- rating;
- estatísticas;
- ranking;
- histórico.

---

## FASE 7 — POLISH

Melhorar:

- sprites;
- animações;
- mapas;
- VFX;
- áudio;
- UI;
- transições;
- feedback;
- performance.

---

# 31. CRITÉRIO DE QUALIDADE

Não considere algo pronto apenas porque:

- compilou;
- abriu no navegador;
- existe visualmente.

Para considerar uma feature concluída:

- funciona;
- está integrada;
- possui tratamento de erro;
- respeita segurança;
- não quebra funcionalidades existentes;
- possui testes quando aplicável;
- está documentada.

---

# 32. REGRAS PARA O CLAUDE CODE

Antes de alterar algo importante:

1. leia o código existente;
2. entenda a arquitetura;
3. identifique dependências;
4. faça a alteração mínima necessária;
5. teste;
6. verifique regressões;
7. documente.

Não reescreva sistemas inteiros sem necessidade.

Não delete funcionalidades existentes para facilitar implementação.

Não use mocks quando existe integração real disponível, exceto durante desenvolvimento explicitamente temporário.

Quando utilizar conectores MCP:

- primeiro inspecione o estado atual;
- não sobrescreva recursos importantes;
- não delete dados sem necessidade;
- não exponha secrets;
- confirme ambiente antes de operações destrutivas.

---

# 33. PRIMEIRA TAREFA

Não comece implementando o jogo inteiro.

Primeiro faça uma análise técnica e produza:

1. arquitetura recomendada;
2. escolha da engine/framework 2D;
3. arquitetura frontend;
4. arquitetura backend;
5. arquitetura multiplayer;
6. modelo de banco Supabase;
7. modelo de autenticação;
8. modelo de segurança;
9. sistema de combate;
10. sistema de hitboxes;
11. sistema de personagens;
12. sistema de bots;
13. pipeline de assets;
14. Art Bible inicial;
15. estrutura de diretórios;
16. estratégia de deploy;
17. roadmap técnico.

Analise especificamente se:

**Netlify + Vercel + Supabase são suficientes para multiplayer realtime de quatro jogadores.**

Se não forem, explique exatamente qual componente adicional é necessário e por quê.

Depois crie a estrutura inicial do projeto.

Então implemente somente a:

**FASE 1 — Vertical Slice**

O primeiro objetivo jogável deverá ser:

**Cavaleiro vs Bot em Castle Courtyard.**

Quando isso estiver funcional, testado e documentado, pare e apresente:

- o que foi criado;
- arquitetura atual;
- arquivos importantes;
- como executar;
- problemas encontrados;
- decisões técnicas;
- próximos passos.

Não avance automaticamente para todas as outras fases.