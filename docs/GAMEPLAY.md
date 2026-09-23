# MagiClash — Gameplay

Platform fighter 2D: dano acumulado aumenta o knockback, elimina quem sai da arena
(detalhes em [COMBAT.md](COMBAT.md)). Partidas de 1 a 5 vidas, até 4 lutadores, FFA ou 2v2.

## Controles (padrão)

| Ação | Teclado | Gamepad |
|---|---|---|
| Mover / mirar | A D (W S para mirar) ou setas | analógico / d-pad |
| Pular | Espaço | A |
| Ataque leve | J / Z | X |
| Ataque pesado | K / X | Y / B |
| Esquiva | L / C / Shift | LB / RB / gatilhos |
| Pausa | Esc / P | Start |
| Tela cheia | F | — |

Direção + ataque = golpe direcional (neutro, lado, cima, baixo; chão e ar → 16 slots).
Segurar o botão em ataques carregáveis aumenta dano, knockback e velocidade do projétil.

## Classes

| Classe | Distância | Identidade | Pontos fortes | Pontos fracos |
|---|---|---|---|---|
| **Cavaleiro** | curta/média | espada, armadura | combo de 3 golpes, avanço, golpe pesado de KO, bom no chão | recuperação horizontal limitada |
| **Bárbaro** | curta + arremesso | machado | maior dano e peso, giratório, arremesso de machado | lento; **desarmado** enquanto o machado está fora (socos mais fracos) até recuperá-lo ou ele voltar sozinho (4 s cravado) |
| **Arqueiro** | média/longa | arco | mais rápido e móvel, flechas, disparo carregado que atravessa 2 alvos, leque de flechas | mais leve (morre mais cedo), só chutes de perto |
| **Mago de Fogo** | média | cajado + fogo | bolas de fogo explosivas (área), coluna de fogo, explosão próxima | feitiços com recarga longa |
| **Mago de Gelo** | média | cajado + gelo | quase tudo aplica **lentidão**, espinhos no chão, lança perfurante | dano moderado |
| **Mago de Raio** | média | cajado + raio | projéteis muito rápidos, **hitstun maior** (combos), raio frontal instantâneo, relâmpago | pouco dano por golpe |

Variações de cor (azul, vermelho, verde, amarelo) = cor do jogador/time (palette swap).
O **machado arremessado** tem física própria: arco com gravidade, gira, crava em paredes/chão,
causa 11% e é recuperado ao encostar. Cooldown de 1,5 s entre arremessos.

## Mapas

| Mapa | Layout | Tendência |
|---|---|---|
| **Castle Courtyard** | muralha 22 tiles + 2 passarelas + balcão central | neutro, simétrico |
| **Enchanted Forest** | rocha-raiz mais estreita, galhos baixos | combate aéreo, favorece mobilidade |
| **Frozen Fortress** | muralha larga, 2 plataformas de gelo em alturas diferentes | amplo, favorece zoners |

Planejados (Fase 7): Wizard Tower, Ancient Ruins, Volcanic Keep.

## Modos

- **Singleplayer vs bots**: 1–3 bots, FFA ou Times 2v2, dificuldade Fácil/Médio/Difícil, bots
  aleatórios ou de uma classe específica.
- **Online** (Fase 5): 1v1 privado → matchmaking 1v1 → 4 jogadores → 2v2.

## Bots

Máquina de estados (`shared/src/ai/bot.ts`): neutro (espaçamento pela distância preferida da
classe), ataque (escolhe golpes cujo alcance — incluindo trajetória de projéteis — atinge a
posição prevista do alvo), perseguição (combos), esquiva (golpes e projéteis vindo na sua direção),
recuperação (pulos, pulo na parede, golpe de recuperação, esquiva aérea), edge-guard, buscar o
machado (Bárbaro). A dificuldade muda **percepção e decisão** (tempo de reação, precisão, chance de
esquiva, erros), nunca atributos. O bot só produz o mesmo `InputFrame` de um jogador.

Balanceamento medido por `npm run sim:balance` (matriz bot×bot de todas as classes; alvo 40–60%).
