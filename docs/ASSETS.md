# MagiClash — Art Bible e Pipeline de Assets

> Toda arte do jogo segue estas regras. Asset que não segue **não entra**, venha de pessoa ou de IA.
> O código da paleta vive em `frontend/src/game/render/palette.ts` e é a fonte da verdade.

## 1. Resolução e escala

| Regra | Valor |
|---|---|
| Resolução base (lógica) | **640 × 360** (16:9) |
| Escala | **preenche a janela** mantendo 16:9 (decisão do usuário: usar a tela inteira). Nearest-neighbour; em escalas não inteiras alguns pixels de arte ficam 1 px de tela mais largos. Em 1920×1080 / 1280×720 a escala é inteira (×3 / ×2) |
| Tamanho do pixel | 1 pixel de arte = 1 unidade de mundo = N pixels de tela. Nunca fracionário |
| Posições | arredondadas para inteiro no render (a sim usa float; o render faz `Math.round`) |
| Rotação/escala em runtime | **proibidas** em sprites (geram pixels tortos). Ângulos são pré-desenhados |
| Filtro | `pixelArt: true` (nearest neighbor), `image-rendering: pixelated` |

## 2. Escala de personagens e tiles

| Item | Valor |
|---|---|
| Tile | 16 × 16 |
| Célula de frame de personagem | 64 × 64, âncora nos pés em (32, 56) |
| Altura do corpo | Arqueiro 32 px · Cavaleiro 34 · Magos 34 (+chapéu) · Bárbaro 38 |
| Largura do corpo | 14–20 px (a hurtbox segue o corpo, não a arma) |
| Proporção | ~2,8 cabeças de altura (estilizado, cabeça/elmo legível). **Comprimento de membros e tamanho da cabeça constantes em todos os frames** |
| Plataforma principal | ≥ 20 tiles de largura; plataformas flutuantes 5–7 tiles |

## 3. Paleta

Paleta mestre limitada (~70 cores em rampas). Nada fora dela: imagens importadas são
**quantizadas** para a paleta no pipeline.

Rampas com *hue shifting*: sombras puxam para roxo/azul, luzes para amarelo/quente. Nunca escurecer
só adicionando preto.

| Rampa | Cores (escuro → claro) |
|---|---|
| ink (outline) | `#1a1422` |
| steel | `#2e3450 #4a5578 #7d8aa8 #b7c2d6 #eef2f7` |
| gold | `#6b3f2a #a8683a #d9a24e #f2d27a` |
| leather | `#3b2420 #5e3a2b #8a5a3c #b5825a` |
| skin | `#6e3b33 #a8634e #d99a7a #f2c8a4` |
| stone | `#2a2733 #403c4c #5b5668 #7b7588 #a29cab` |
| moss | `#1f3328 #2f4f35 #4d7040 #7a9a4f` |
| wood | `#3a2518 #5c3a22 #86582f #b07d45` |
| sky (entardecer) | `#1f1b3a #332a5c #5a3f7a #8f5b8c #cc7a86 #eea57e #fcd49a` |
| team blue | `#1d2b5e #2f4fa8 #4f86e0 #9cc6f5` |
| team red | `#4a1420 #8c2230 #cf3f3a #f28a6b` |
| team green | `#1a3a24 #2f6b33 #56a33f #a5d86a` |
| team yellow | `#5a3a10 #a8741c #e8b830 #fbe68a` |
| fire | `#5a1a10 #b8361e #ee6a26 #fbb03b #fff1a8` |
| ice | `#1a3552 #2f6fa0 #5fb4de #a8e4f5 #eafcff` |
| lightning | `#3b2a7a #6a5ae0 #a8a0ff #e8e4ff #fffbe0` |

Cores de time aparecem em **tabardo, pluma, faixa/capuz**: sempre a mesma região do sprite, para
que variações (ex.: arqueiro verde/azul/amarelo/vermelho) sejam *palette swap* puro.

## 4. Iluminação

- Luz principal: **alto-esquerda** no cenário (sol de fim de tarde). Personagens: luz de
  cima-frente (espelha junto com o sprite — aceito por legibilidade).
- Sombreamento em **2–3 tons chapados** (cel shading). Sem gradiente suave em sprites.
- Dithering: **só** em céu/fundos distantes (padrão ordenado 2×2). Nunca em personagens.
- Luz dinâmica (fogo/raio) é aproximada com sprites de brilho em rampa da paleta, não com shaders
  de blur.

## 5. Outline e leitura

- Personagens e projéteis: **outline externo de 1 px em `ink`** (nunca preto puro). Linhas internas
  coloridas (tom mais escuro da rampa local).
- Cenário de fundo: **sem outline**.
- Plataformas jogáveis: borda superior clara de alto contraste (o jogador precisa ler onde pisa).
- **Hierarquia de valor:** personagens = saturação e contraste máximos; plataformas = contraste
  médio; fundos = dessaturados e puxados para a cor do céu (perspectiva atmosférica) quanto mais
  longe. Teste: converter a tela para escala de cinza — os lutadores devem continuar se destacando.

## 6. Sombras

- Sombra de contato: elipse de 1–2 px de altura em `ink` 50% sob o personagem **quando no chão**
  (ajuda a ler altura em plataformas). Única exceção de alpha em personagens.
- Sem drop-shadows desfocados em UI ou sprites.

## 7. Animação

| Regra | Valor |
|---|---|
| Simulação | 60 ticks/s. Frames de sprite seguram 2–8 ticks |
| Idle | 4 frames, ~8 fps |
| Corrida | 6 frames, ~12 fps |
| Ataques | poses-chave nos limites de **startup → active → recovery** dos frame data. O frame ativo pode ter *smear* |
| Antecipação | golpes pesados têm pose de antecipação clara durante o startup (legibilidade para reagir) |
| Peso | cavaleiro/bárbaro: squash de 1 px na aterrissagem; arqueiro: sem squash |
| Consistência | o gerador de poses usa comprimentos fixos de membros/arma: proporção não varia entre frames |

## 8. Partículas e efeitos

- **Clareza de gameplay > quantidade de efeitos.**
- Partículas: quadrados de 1×1 ou 2×2 px, cores da paleta, vida < 0,5 s, **no máximo ~150 simultâneas**.
- Alpha só em 3 degraus (100/66/33%). Blend aditivo somente em núcleo de fogo/raio.
- Hit spark ≤ 8 frames; slash ≤ 10 frames; poeira ≤ 12 frames.
- Screen shake: máximo 6 px, decai rápido. Hit-stop 3–12 ticks conforme o dano.
- Efeitos nunca cobrem a hurtbox do alvo por mais que o hit-stop.

## 9. UI

- Fonte bitmap própria 5×7 px (`frontend/src/ui/pixelFont.ts`). Nada de fontes vetoriais suavizadas
  no canvas.
- Painéis: moldura de pedra/pergaminho em 9-slice, cantos em degrau de pixel, sem cantos
  arredondados suaves, sem blur, sem glassmorphism.
- Cor do dano no HUD: branco (0%) → amarelo (50) → laranja (100) → vermelho (150) → vinho (200+).
- Tudo alinhado em pixel inteiro da resolução base.

## 10. Pipeline de assets (inclui IA/Higgsfield)

Nenhum asset gerado por IA entra direto no jogo.

1. **Gerar:** Higgsfield só para **conceito/referência** (moodboard de cenário, silhueta de personagem,
   paleta de ambiente, texturas de referência, sons base). Prompt, modelo e data vão para o log abaixo.
   Brutos ficam em `assets-raw/` (fora do git).
2. **Avaliar** (checklist: tudo precisa ser "sim"):
   - [ ] Pixels de tamanho uniforme, sem anti-aliasing/blur, sem "pseudo pixel art"?
   - [ ] Proporções batem com §2? Mesma altura/cabeça que os outros personagens?
   - [ ] Luz vem da direção da §4? Sem luz incoerente?
   - [ ] Silhueta legível em 1× e em escala de cinza?
   - [ ] Nada que lembre personagens/mapas/UI de outro jogo?
3. **Corrigir** manualmente (Aseprite/LibreSprite): redesenho na resolução nativa, limpeza de pixels órfãos.
4. **Adequar à Art Bible:** quantizar para a paleta, outline `ink`, âncora (32,56), célula 64×64.
5. **Otimizar:** empacotar em texture atlas (spritesheet + JSON), PNG indexado, áudio OGG/MP3 curto.
6. **Integrar:** registrar em `frontend/src/assets/manifest.ts` e no log abaixo.

Se estiver visualmente ruim: **não usa**. Placeholder procedural é preferível.

### Estado atual (Fase 1)

**Nenhum asset de IA foi usado.** Toda a arte da vertical slice é **gerada por código** na inicialização
(`frontend/src/game/render/`), desenhada pixel a pixel com a paleta acima:
- cavaleiro por "marionete de pixels" (partes fixas + poses por frame → proporção sempre constante,
  outline automático);
- cenário Castle Courtyard em camadas com parallax;
- efeitos (sparks, arcos de corte, poeira) e fonte bitmap.

Isso dá uma base coerente para jogar e balancear. Na Fase 7 os sprites são substituídos por pixel art
final mantendo os mesmos nomes de frames/animações (o render só troca a textura).

### Fundos pintados (Higgsfield)

Os fundos distantes dos 6 mapas e a tela de título usam imagens do Higgsfield, processadas por
`tools/process_backdrops.py` (redução para a resolução nativa, quantização para a paleta, dither 2×2
só no fundo). `maps/backdrops.ts` as carrega no `BootScene`. Quando o fundo pintado existe, o `StageView`
o desenha em parallax 0,05 e **omite as camadas procedurais atrás do mundo jogável** (céu, fundo e
muros intermediários); plataformas e primeiro plano continuam procedurais. Se a imagem não carregar,
o cenário procedural completo volta a aparecer. Arquivo bruto → mapa: `castelo`→Castle Courtyard,
`elder_forest`→Enchanted Forest, `ice_castle`→Frozen Fortress, `dark_reign`→Wizard Tower,
`old_ruins`→Ancient Ruins, `vulcan`→Volcanic Keep, `wizard_tower`→título.

Para trocar um fundo: substitua o bruto em `assets-raw/higgsfield/` e rode
`backend\.venv\Scripts\python.exe tools/process_backdrops.py`.

### Log de assets

| Asset | Origem | Ferramenta/prompt | Status |
|---|---|---|---|
| Fundos pintados dos 6 mapas + arte do título | Higgsfield `z_image`, 2048×1152, 2026-09-24 (brutos em `assets-raw/higgsfield/`; prompts no histórico do Higgsfield: "16-bit pixel art video game background, side-scrolling fighting game stage backdrop, far distance only…") | `tools/process_backdrops.py`: reduz para 640×360 + margem de parallax, quantiza para a paleta mestre com dither 2×2 → `frontend/src/assets/backdrops/` | em uso |
| 6 classes (placeholder) | procedural | `render/fighterSprite.ts` (poses do cavaleiro em `knightSprite.ts`) | em uso (placeholder) |
| Projéteis e efeitos elementais | procedural | `render/projectileSprites.ts` | em uso (placeholder) |
| Enchanted Forest, Frozen Fortress | procedural | `maps/*Art.ts`, `maps/stageKit.ts` | em uso (placeholder) |
| Castle Courtyard (placeholder) | procedural | `maps/castleCourtyardArt.ts` | em uso (placeholder) |
| Efeitos básicos | procedural | `render/effectSprites.ts` | em uso (placeholder) |
| SFX | síntese WebAudio | `audio/sfx.ts` | em uso (placeholder) |
