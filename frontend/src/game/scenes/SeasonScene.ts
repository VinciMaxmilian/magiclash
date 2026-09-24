import Phaser from 'phaser';
import { CHARACTERS, CURRENT_SEASON, STAGES, type CharacterDefinition } from '@magiclash/shared';
import { svc } from '../services';
import { StageView } from '../maps/StageView';
import { REF_CENTER } from '../maps/castleCourtyardArt';
import { PAL, TEAM_ORDER, type TeamColor } from '../render/palette';
import { ensureFighterTexture, ensurePanel } from '../render/textures';
import { ANCHOR_X, ANCHOR_Y, CELL, LOOPS, STYLES } from '../render/fighterSprite';
import { pixelText, setPixelText } from '../../ui/text';
import { defaultSetup } from '../match/setup';

type Tab = 'characters' | 'stages';

const CLASS_LABEL: Record<string, string> = {
  hunter: 'CAÇADOR',
  fighter: 'LUTADOR',
  vampire: 'VAMPIRO',
  dhampir: 'MESTIÇO',
  summoner: 'INVOCADORA',
};

const STAGE_TEXT: Record<string, { title: string; text: string }> = {
  throne_hall: {
    title: 'SALÃO DO TRONO',
    text: 'O SALÃO DE UM CASTELO VAMPÍRICO SOB A LUA VERMELHA. CHÃO LARGO, UM ESTRADO NO CENTRO E TRÊS LUSTRES DE FERRO COMO PLATAFORMAS.',
  },
  hunters_library: {
    title: 'BIBLIOTECA DOS CAÇADORES',
    text: 'O ARQUIVO SECRETO DE UMA ORDEM DE CAÇADORES. PRATELEIRAS EM ESCADA LEVAM ATÉ UMA GALERIA ALTA: MUITO COMBATE VERTICAL.',
  },
};

/** Special moves shown on the card: heavy attacks + the side light (usually the signature). */
const SIGNATURE_SLOTS = [
  ['side_light', '~ | + LEVE'],
  ['neutral_heavy', 'FORTE'],
  ['side_heavy', '~ | + FORTE'],
  ['down_heavy', '} + FORTE'],
  ['up_heavy', '{ + FORTE'],
] as const;

const wrap = (text: string, width: number): string => {
  const lines: string[] = [];
  let line = '';
  for (const w of text.toUpperCase().split(' ')) {
    if ((line + ' ' + w).trim().length > width) {
      lines.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join('\n');
};

/**
 * TEMPORADA: what the current season added (new fighters and maps), with a preview of each and
 * a shortcut into the fighter select with that fighter / map already chosen.
 */
export class SeasonScene extends Phaser.Scene {
  private tab: Tab = 'characters';
  private index = 0;
  private t = 0;
  private color: TeamColor = 'red';
  private cards: Phaser.GameObjects.Image[] = [];
  private tabTexts: Phaser.GameObjects.BitmapText[] = [];
  private preview?: Phaser.GameObjects.Image;
  private title!: Phaser.GameObjects.BitmapText;
  private subtitle!: Phaser.GameObjects.BitmapText;
  private body!: Phaser.GameObjects.BitmapText;
  private moves: Phaser.GameObjects.BitmapText[] = [];
  private keys: Phaser.GameObjects.BitmapText[] = [];

  constructor() {
    super('Season');
  }

  create(data: { tab?: Tab; index?: number } = {}): void {
    svc().input.flush();
    this.tab = data.tab ?? 'characters';
    this.index = data.index ?? 0;
    this.t = 0;
    const season = CURRENT_SEASON;
    const stageId = this.tab === 'stages' ? season.stages[this.index] : season.stages[0];

    // The selected map (or the season's first) is the living background.
    new StageView(this, stageId);
    this.cameras.main.setRoundPixels(true).setScroll(REF_CENTER.x - 320, REF_CENTER.y - 180 - 30);
    this.add.rectangle(320, 180, 640, 360, PAL.ink, this.tab === 'stages' ? 0.35 : 0.6).setScrollFactor(0);

    pixelText(this, 320, 8, season.name, { scale: 2, align: 'center', color: PAL.gold[3], depth: 10 });
    pixelText(this, 320, 30, season.subtitle, { align: 'center', color: 0xcf3f3a, depth: 10 });
    pixelText(this, 320, 42, season.blurb.toUpperCase(), { align: 'center', outline: false, color: PAL.steel[3], depth: 10 });

    this.tabTexts = (['NOVOS LUTADORES', 'NOVOS MAPAS'] as const).map((label, i) =>
      pixelText(this, 250 + i * 140, 60, label, { align: 'center', depth: 10 }),
    );

    // Left column: one card per new fighter / map.
    const items = this.tab === 'characters' ? season.characters : season.stages;
    this.cards = items.map((id, i) => {
      const y = 94 + i * 44;
      const card = this.add.image(70, y, ensurePanel(this, 104, 40)).setScrollFactor(0).setDepth(10);
      if (this.tab === 'characters') {
        this.add.image(38, y, `portrait_${id}_red`).setScale(2).setScrollFactor(0).setDepth(11);
        pixelText(this, 60, y - 4, CHARACTERS[id].name.toUpperCase(), { outline: false, color: PAL.steel[4], depth: 11 });
      } else {
        pixelText(this, 26, y - 4, STAGE_TEXT[id]?.title ?? STAGES[id].name, { outline: false, color: PAL.steel[4], depth: 11 });
      }
      return card;
    });

    // Right: detail panel.
    // Maps: a short caption panel, so the map itself (the background) stays visible.
    const chars = this.tab === 'characters';
    if (chars) this.add.image(390, 206, ensurePanel(this, 392, 236)).setScrollFactor(0).setDepth(10);
    else this.add.image(390, 114, ensurePanel(this, 392, 76)).setScrollFactor(0).setDepth(10);
    const tx = chars ? 316 : 206;
    this.title = pixelText(this, tx, chars ? 96 : 84, '', { scale: 2, color: PAL.gold[3], depth: 12 });
    this.subtitle = pixelText(this, tx, 118, '', { color: 0xcf3f3a, depth: 12 });
    this.body = pixelText(this, tx, chars ? 134 : 108, '', { outline: false, color: PAL.steel[3], depth: 12 });
    this.moves = [];
    this.keys = [];
    if (this.tab === 'characters') {
      this.preview = this.add.image(250, 240, 'px').setScale(2).setScrollFactor(0).setDepth(12).setOrigin(ANCHOR_X / CELL, ANCHOR_Y / CELL);
      pixelText(this, 316, 196, 'GOLPES ESPECIAIS', { color: PAL.gold[2], depth: 12 });
      SIGNATURE_SLOTS.forEach((_, k) => {
        this.keys.push(pixelText(this, 316, 210 + k * 12, '', { outline: false, color: PAL.sky[4], depth: 12 }));
        this.moves.push(pixelText(this, 396, 210 + k * 12, '', { outline: false, color: PAL.steel[4], depth: 12 }));
      });
    } else {
      this.preview = undefined;
    }

    pixelText(this, 320, 340, '~ | ABA   { } ESCOLHER   ENTER JOGAR   ESC VOLTAR', { align: 'center', color: PAL.sky[3], depth: 11 });
    this.cameras.main.fadeIn(150, 26, 20, 34);
    this.refresh();
  }

  private get items(): readonly string[] {
    return this.tab === 'characters' ? CURRENT_SEASON.characters : CURRENT_SEASON.stages;
  }

  private refresh(): void {
    this.tabTexts.forEach((t, i) => t.setTint((i === 0) === (this.tab === 'characters') ? PAL.gold[3] : PAL.stone[4]));
    this.cards.forEach((c, i) => {
      const sel = i === this.index;
      c.setTexture(ensurePanel(this, 104, 40, sel ? PAL.gold[3] : undefined)).setTint(sel ? 0xffffff : 0xb7c2d6);
    });
    const id = this.items[this.index];
    if (this.tab === 'characters') {
      const c: CharacterDefinition = CHARACTERS[id];
      setPixelText(this.title, c.name.toUpperCase());
      setPixelText(this.subtitle, `CLASSE: ${CLASS_LABEL[c.class] ?? c.class.toUpperCase()}`);
      setPixelText(this.body, wrap(c.description, 42));
      const attacks = new Map(c.attacks.map((a) => [a.id, a]));
      SIGNATURE_SLOTS.forEach(([slot, key], k) => {
        const a = attacks.get(c.moveset[slot] ?? '');
        setPixelText(this.keys[k], key);
        setPixelText(this.moves[k], a ? a.name.toUpperCase() : '-');
      });
      this.color = TEAM_ORDER[(this.index + 1) % TEAM_ORDER.length];
      this.preview?.setTexture(ensureFighterTexture(this, id, this.color), 'idle_0');
    } else {
      const st = STAGE_TEXT[id];
      setPixelText(this.title, st?.title ?? STAGES[id].name);
      setPixelText(this.subtitle, '');
      setPixelText(this.body, wrap(st?.text ?? '', 62));
    }
  }

  override update(_time: number, delta: number): void {
    const { input, audio } = svc();
    input.update();
    this.t += delta / 16.67;
    if (this.preview && this.tab === 'characters') {
      const idle = LOOPS[STYLES[this.items[this.index]].family].idle;
      this.preview.setFrame(`idle_${Math.floor(this.t / 10) % idle.length}`);
    }
    const n = this.items.length;
    if (input.wasPressed('left') || input.wasPressed('right')) {
      audio.play('ui_move', 'ui');
      this.scene.restart({ tab: this.tab === 'characters' ? 'stages' : 'characters', index: 0 });
      return;
    }
    if (input.wasPressed('up') || input.wasPressed('down')) {
      this.index = (this.index + (input.wasPressed('up') ? n - 1 : 1)) % n;
      audio.play('ui_move', 'ui');
      // Maps: the background itself is the preview, so rebuild the scene around it.
      if (this.tab === 'stages') this.scene.restart({ tab: 'stages', index: this.index });
      else this.refresh();
      return;
    }
    if (input.wasPressed('confirm')) {
      audio.play('ui_confirm', 'ui');
      const setup = defaultSetup(svc().settings.difficulty);
      const id = this.items[this.index];
      if (this.tab === 'characters') setup.slots[0].characterId = id;
      else setup.stageId = id;
      this.scene.start('Select', { setup });
    } else if (input.wasPressed('back')) {
      audio.play('ui_back', 'ui');
      this.scene.start('Title');
    }
  }
}
