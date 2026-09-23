# MagiClash — Sistema de Combate

Código: `shared/src/combat`, `shared/src/sim`. Dados: `shared/src/data/characters/*.ts`.

## 1. Loop e unidades

- Simulação **fixed-step 60 ticks/s**. Frame data em ticks.
- Distâncias em pixels de arte; velocidades em px/tick. Y cresce para baixo.
- Cada tick: input → máquina de estados → física → detecção de hits (todos contra todos,
  coletados e aplicados juntos → trocas simultâneas funcionam) → blast zones → regras da partida.

## 2. Dano acumulado + knockback progressivo

Dano não mata. Ele aumenta o quanto os próximos golpes lançam:

```
launch  = clamp((base + growth × dano/100) / weight, 0, 24)      // px/tick
vetor   = (cos(ângulo) × launch × facing_atacante, −sin(ângulo) × launch)
hitstun = clamp(round(launch × 2.9 × hitstunMultiplier), 6, 70)  // ticks
hitstop = min(14, floor(3 + dano × 0.4 + bônus))                 // ticks, atacante e alvo
```

- `dano` é o do alvo **depois** do golpe.
- Ângulo negativo = spike (para baixo); contra alvo no chão vira 25° (não dá para cravar no chão).
- Lançado: arrasto 0.966/tick e gravidade ×0.8 enquanto em hitstun. Bate em parede/chão acima de
  4 px/tick → quica (restituição 0.45).
- **Eliminação:** sair da blast zone. O KO é creditado ao último atacante se aconteceu até 6 s depois
  do golpe; senão conta como autodestruição.
- Ser atingido devolve o golpe de recuperação (evita "morte garantida" por usar cedo demais).

Calibração atual (Castle Courtyard, relatório bot×bot `npm run sim:balance`): KO mediano em
~100–140%, partidas de 3 vidas em ~1,5–2,5 min.

## 3. Estados do lutador

`idle · run · air · attack · hitstun · dodge · landing · dead`

| Mecânica | Regra |
|---|---|
| Pulo | chão + `maxAirJumps` no ar. Soltar o botão subindo = pulo curto. Coyote time 5 ticks |
| Queda rápida | ↓ no ar perto do ápice → `fastFallSpeed` |
| Plataformas one-way | atravessa por baixo; segurar ↓ 3 ticks desce (↓+ataque continua sendo ataque baixo) |
| Parede | segurar contra a parede no ar = deslize lento; pulo = wall jump (máx. 3 por tempo no ar) |
| Esquiva | chão: rolamento/no lugar; ar: 8 direções, 1× por tempo no ar. Invulnerável na janela `invulnFrom..invulnTo`, depois cooldown |
| Buffer | apertos ficam 6 ticks no buffer enquanto o lutador não pode agir |
| Ataques | direção + botão (leve/pesado), chão/ar → 16 slots. Cada ataque tem startup/active/recovery/cooldown |
| Combos | `chain`: apertar leve dentro da janela emenda o próximo golpe |
| Aéreos | cancelam ao pousar com `landingLag` |
| Recuperação | `recoveryMove: true` → 1× por tempo no ar (volta ao pousar ou ao ser atingido) |

## 4. Hitboxes (independentes do sprite)

- **Body** (colisão com cenário): AABB `body.w × body.h` ancorado nos pés.
- **Hurtboxes**: retângulos por personagem (hoje fixos por personagem; preparado para variar por
  estado).
- **Hitboxes**: por ataque, com janela `from..to` dentro dos frames ativos, espelhadas pelo facing.
- **Projéteis**: entidades próprias com hitbox, velocidade, gravidade, vida útil, número de acertos
  e colisão com cenário (Fase 2).
- Um ataque acerta cada alvo **uma vez** por instância.
- Debug (DEV, F1): verde = hurtbox, vermelho = hitbox, azul = body, amarelo = cenário,
  magenta = blast zone. F2 = câmera lenta ×0,25.

## 5. Definição de dados (balanceamento sem mexer no código)

```ts
AttackDefinition {
  id, name, direction, aerial,
  damage, knockback { base, growth, angle },
  startup, active, recovery, cooldown, range,
  hitboxes[{ x, y, w, h, from?, to? }],
  movement?[{ frame, vx?, vy?, mode? }], gravityScale?, friction?,
  landingLag?, untilLanding?, recoveryMove?, chain?, hitstopBonus?,
  projectile?,                  // Fase 2
  effect, sound, anim           // puramente cosméticos
}
```

`validateCharacter()` roda nos testes e no boot em DEV: frame data inválido falha na hora.

## 6. Anti-exploit já garantido pela simulação

Testes em `shared/tests/exploits.test.ts`: input fora de 1 byte é zerado; segurar ataque não
repete; spam não fura cooldown; recuperação e esquiva aérea são 1× por tempo no ar; não se age em
hitstun nem morto; frame data adulterado numa cópia não afeta outra simulação; máximo de 4 lutadores.
