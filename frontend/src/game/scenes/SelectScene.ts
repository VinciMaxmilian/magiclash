import Phaser from 'phaser';
import {
  CHARACTERS,
  CHARACTER_ORDER,
  STAGES,
  STAGE_ORDER,
  type BotDifficulty,
  type CharacterDefinition,
} from '@magiclash/shared';
import { svc } from '../services';
import { StageView } from '../maps/StageView';
import { REF_CENTER } from '../maps/castleCourtyardArt';
import { PAL, TEAM_ORDER, TEAM_RAMPS, type TeamColor } from '../render/palette';
import { ensureFighterTexture, ensurePanel } from '../render/textures';
import { ANCHOR_X, ANCHOR_Y, CELL, LOOPS, STYLES } from '../render/fighterSprite';
import { pixelText, setPixelText } from '../../ui/text';
import type { MatchSetup, SlotSetup } from '../match/setup';
import { DIFFICULTIES, DIFFICULTY_LABEL } from './labels';
import { account, displayName } from '../../services/account';

const COLOR_LABEL: Record<TeamColor, string> = { blue: 'AZUL', red: 'VERMELHO', green: 'VERDE', yellow: 'AMARELO' };
const STAGE_BLURB: Record<string, string> = {
  castle_courtyard: 'NEUTRO: PLATAFORMAS SIMÉTRICAS',
  enchanted_forest: 'ESTREITO: COMBATE AÉREO',
  frozen_fortress: 'AMPLO E ASSIMÉTRICO',
};

interface Choice {
  character: number;
  color: number;
  opponents: number;
  botCharacter: number; // -1 = random
  difficulty: number;
  mode: 'ffa' | 'teams';
  stage: number;
  stocks: number;
}

/** Rough 1..6 ratings derived from the data (never hand-typed, so they stay honest). */
const ratings = (c: CharacterDefinition) => {
  const dmg = c.attacks.reduce((a, x) => a + x.damage, 0) / Math.max(1, c.attacks.filter((a) => a.damage > 0).length);
  const proj = (c.projectiles ?? []).reduce((a, p) => Math.max(a, p.damage), 0);
  const clamp6 = (v: number) => Math.max(1, Math.min(6, Math.round(v)));
  return [
    ['VELOCIDADE', clamp6((c.moveSpeed - 2.1) * 5.5 + 1)],
    ['PESO', clamp6((c.weight - 0.8) * 11 + 1)],
    ['ALCANCE', c.preferredRange === 'far' ? 6 : c.preferredRange === 'mid' ? 4 : 2],
    ['DANO', clamp6(Math.max(dmg, proj) - 3)],
  ] as const;
};

/** Wraps text to `width` characters (pixel font is monospace). */
const wrap = (text: string, width: number): string => {
  const words = text.toUpperCase().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      lines.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join('\n');
};

export class SelectScene extends Phaser.Scene {
  private choice!: Choice;
  private row = 0;
  private rows: { label: () => string; adjust: (d: -1 | 1) => void; text?: Phaser.GameObjects.BitmapText }[] = [];
  private cards: { frame: Phaser.GameObjects.Image; portrait: Phaser.GameObjects.Image }[] = [];
  private preview!: Phaser.GameObjects.Image;
  private previewName!: Phaser.GameObjects.BitmapText;
  private previewDesc!: Phaser.GameObjects.BitmapText;
  private statBars!: Phaser.GameObjects.Graphics;
  private statLabels: Phaser.GameObjects.BitmapText[] = [];
  private t = 0;

  constructor() {
    super('Select');
  }

  create(data: { setup?: MatchSetup }): void {
    const s = svc();
    s.input.flush();
    this.t = 0;
    this.row = 0;
    this.choice = this.fromSetup(data?.setup, s.settings.difficulty);

    new StageView(this, 'castle_courtyard');
    this.cameras.main.setRoundPixels(true).setScroll(REF_CENTER.x - 320, REF_CENTER.y - 180 - 40);
    this.add.rectangle(320, 180, 640, 360, PAL.ink, 0.55).setScrollFactor(0);
    this.cameras.main.fadeIn(200, 26, 20, 34);

    pixelText(this, 320, 8, 'ESCOLHA SEU LUTADOR', { scale: 2, align: 'center', color: PAL.gold[3], depth: 10 });

    // Character cards (3 × 2)
    this.cards = CHARACTER_ORDER.map((id, i) => {
      const x = 44 + (i % 3) * 58;
      const y = 62 + Math.floor(i / 3) * 62;
      const frame = this.add.image(x, y, ensurePanel(this, 52, 56)).setScrollFactor(0).setDepth(10);
      const portrait = this.add.image(x, y - 6, `portrait_${id}_blue`).setScale(2).setScrollFactor(0).setDepth(11);
      pixelText(this, x, y + 16, CHARACTERS[id].name.split(' ').slice(-1)[0], { align: 'center', outline: false, color: PAL.steel[3], depth: 11 });
      return { frame, portrait };
    });

    // Preview
    this.add.image(146, 262, ensurePanel(this, 280, 128)).setScrollFactor(0).setDepth(10);
    this.preview = this.add.image(50, 304, 'px').setScale(2).setScrollFactor(0).setDepth(12).setOrigin(ANCHOR_X / CELL, ANCHOR_Y / CELL);
    this.previewName = pixelText(this, 96, 206, '', { color: PAL.gold[3], depth: 12 });
    this.previewDesc = pixelText(this, 96, 220, '', { outline: false, color: PAL.steel[3], depth: 12 });
    this.statBars = this.add.graphics().setScrollFactor(0).setDepth(12);
    this.statLabels = [0, 1, 2, 3].map((k) => pixelText(this, 96, 272 + k * 11, '', { outline: false, color: PAL.sky[4], depth: 12 }));

    // Options
    const c = this.choice;
    const cycle = (v: number, n: number, d: number) => (v + d + n) % n;
    this.rows = [
      { label: () => `LUTADOR  < ${CHARACTERS[CHARACTER_ORDER[c.character]].name} >`, adjust: (d) => (c.character = cycle(c.character, CHARACTER_ORDER.length, d)) },
      { label: () => `COR      < ${COLOR_LABEL[TEAM_ORDER[c.color]]} >`, adjust: (d) => (c.color = cycle(c.color, 4, d)) },
      {
        label: () => `OPONENTES < ${c.mode === 'teams' ? '3 (2V2)' : c.opponents} >`,
        adjust: (d) => {
          if (c.mode !== 'teams') c.opponents = Math.max(1, Math.min(3, c.opponents + d));
        },
      },
      {
        label: () => `BOTS     < ${c.botCharacter < 0 ? 'ALEATÓRIOS' : CHARACTERS[CHARACTER_ORDER[c.botCharacter]].name} >`,
        adjust: (d) => (c.botCharacter = ((c.botCharacter + 1 + d + CHARACTER_ORDER.length + 1) % (CHARACTER_ORDER.length + 1)) - 1),
      },
      { label: () => `NÍVEL    < ${DIFFICULTY_LABEL[DIFFICULTIES[c.difficulty]]} >`, adjust: (d) => (c.difficulty = cycle(c.difficulty, 3, d)) },
      { label: () => `MODO     < ${c.mode === 'teams' ? 'TIMES 2V2' : 'TODOS X TODOS'} >`, adjust: () => (c.mode = c.mode === 'teams' ? 'ffa' : 'teams') },
      { label: () => `MAPA     < ${STAGES[STAGE_ORDER[c.stage]].name} >`, adjust: (d) => (c.stage = cycle(c.stage, STAGE_ORDER.length, d)) },
      { label: () => `VIDAS    < ${c.stocks} >`, adjust: (d) => (c.stocks = Math.max(1, Math.min(5, c.stocks + d))) },
      { label: () => '>>> LUTAR! <<<', adjust: () => undefined },
    ];
    this.add.image(468, 190, ensurePanel(this, 322, 150)).setScrollFactor(0).setDepth(10);
    this.rows.forEach((r, i) => (r.text = pixelText(this, 318, 124 + i * 14, '', { depth: 11 })));
    pixelText(this, 468, 272, '', { align: 'center', outline: false, color: PAL.sky[4], depth: 11 }).setName('stageBlurb');

    pixelText(this, 320, 340, '{ } OPÇÃO   ~ | ALTERAR   ENTER LUTAR   ESC VOLTAR', { align: 'center', color: PAL.sky[3], depth: 11 });
    this.refresh();
  }

  private fromSetup(setup: MatchSetup | undefined, difficulty: BotDifficulty): Choice {
    const base: Choice = {
      character: 0,
      color: 0,
      opponents: 1,
      botCharacter: -1,
      difficulty: DIFFICULTIES.indexOf(difficulty),
      mode: 'ffa',
      stage: 0,
      stocks: 3,
    };
    if (!setup) return base;
    const human = setup.slots.find((sl) => sl.bot === null) ?? setup.slots[0];
    const bots = setup.slots.filter((sl) => sl.bot !== null);
    return {
      ...base,
      character: Math.max(0, CHARACTER_ORDER.indexOf(human.characterId as (typeof CHARACTER_ORDER)[number])),
      color: Math.max(0, TEAM_ORDER.indexOf(human.color)),
      opponents: Math.max(1, bots.length),
      difficulty: DIFFICULTIES.indexOf(bots[0]?.bot ?? difficulty),
      mode: setup.mode,
      stage: Math.max(0, STAGE_ORDER.indexOf(setup.stageId as (typeof STAGE_ORDER)[number])),
      stocks: setup.stocks,
    };
  }

  private buildSetup(): MatchSetup {
    const c = this.choice;
    const difficulty = DIFFICULTIES[c.difficulty];
    const pick = () =>
      c.botCharacter >= 0 ? CHARACTER_ORDER[c.botCharacter] : CHARACTER_ORDER[Math.floor(Math.random() * CHARACTER_ORDER.length)];
    const me: SlotSetup = { characterId: CHARACTER_ORDER[c.character], color: TEAM_ORDER[c.color], team: 0, label: displayName(), bot: null, avatarUrl: account.profile?.avatar_url ?? null };
    if (c.mode === 'teams') {
      // Team colors are fixed for readability: blue/green vs red/yellow.
      return {
        stageId: STAGE_ORDER[c.stage],
        stocks: c.stocks,
        timeLimit: 300,
        mode: 'teams',
        slots: [
          { ...me, color: 'blue' },
          { characterId: pick(), color: 'green', team: 0, label: 'CPU1', bot: difficulty },
          { characterId: pick(), color: 'red', team: 1, label: 'CPU2', bot: difficulty },
          { characterId: pick(), color: 'yellow', team: 1, label: 'CPU3', bot: difficulty },
        ],
      };
    }
    const others = TEAM_ORDER.filter((col) => col !== me.color);
    return {
      stageId: STAGE_ORDER[c.stage],
      stocks: c.stocks,
      timeLimit: c.opponents > 1 ? 300 : 240,
      mode: 'ffa',
      slots: [
        me,
        ...Array.from({ length: c.opponents }, (_, i) => ({
          characterId: pick(),
          color: others[i],
          team: i + 1,
          label: c.opponents > 1 ? `CPU${i + 1}` : 'CPU',
          bot: difficulty,
        })),
      ],
    };
  }

  private refresh() {
    const c = this.choice;
    const id = CHARACTER_ORDER[c.character];
    const color = TEAM_ORDER[c.color];
    this.cards.forEach((card, i) => {
      const sel = i === c.character;
      card.frame.setTexture(ensurePanel(this, 52, 56, sel ? PAL.gold[3] : undefined)).setAlpha(sel ? 1 : 0.8);
      card.portrait.setTexture(`portrait_${CHARACTER_ORDER[i]}_${sel ? color : 'blue'}`);
      card.frame.setTint(sel ? 0xffffff : 0xb7c2d6);
    });
    const def = CHARACTERS[id];
    this.preview.setTexture(ensureFighterTexture(this, id, color), 'idle_0');
    setPixelText(this.previewName, def.name);
    setPixelText(this.previewDesc, wrap(def.description, 29));
    this.statBars.clear();
    ratings(def).forEach(([label, v], k) => {
      setPixelText(this.statLabels[k], label);
      for (let i = 0; i < 6; i++) {
        this.statBars.fillStyle(i < v ? TEAM_RAMPS[color][2] : PAL.stone[1], 1);
        this.statBars.fillRect(96 + 66 + i * 7, 275 + k * 11, 6, 5);
      }
    });
    this.rows.forEach((r, i) => {
      setPixelText(r.text!, `${i === this.row ? '> ' : '  '}${r.label()}`);
      r.text!.setTint(i === this.row ? PAL.gold[3] : i === this.rows.length - 1 ? PAL.fire[3] : PAL.steel[3]);
    });
    const blurb = this.children.getByName('stageBlurb') as Phaser.GameObjects.BitmapText | null;
    if (blurb) setPixelText(blurb, STAGE_BLURB[STAGE_ORDER[c.stage]] ?? '');
  }

  override update(_t: number, delta: number): void {
    const { input, audio, settings } = svc();
    input.update();
    this.t += delta / 16.67;
    // animate the preview idle loop
    const id = CHARACTER_ORDER[this.choice.character];
    const idle = LOOPS[STYLES[id].family].idle;
    this.preview.setFrame(`idle_${Math.floor(this.t / 10) % idle.length}`);

    const n = this.rows.length;
    if (input.wasPressed('up') || input.wasPressed('down')) {
      this.row = (this.row + (input.wasPressed('up') ? n - 1 : 1)) % n;
      audio.play('ui_move', 'ui');
      this.refresh();
    } else if (input.wasPressed('left') || input.wasPressed('right')) {
      this.rows[this.row].adjust(input.wasPressed('left') ? -1 : 1);
      audio.play('ui_move', 'ui');
      this.refresh();
    } else if (input.wasPressed('confirm')) {
      audio.play('ui_confirm', 'ui');
      settings.difficulty = DIFFICULTIES[this.choice.difficulty];
      svc().saveSettings();
      const setup = this.buildSetup();
      this.cameras.main.fadeOut(200, 26, 20, 34);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Match', setup));
    } else if (input.wasPressed('back')) {
      audio.play('ui_back', 'ui');
      this.scene.start('Title');
    }
  }
}
