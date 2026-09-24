import Phaser from 'phaser';
import { TICK_RATE, getCharacter, getStage } from '@magiclash/shared';
import { svc } from '../services';
import { StageView } from '../maps/StageView';
import { REF_CENTER } from '../maps/castleCourtyardArt';
import { PAL, TEAM_RAMPS } from '../render/palette';
import { ensurePanel } from '../render/textures';
import { pixelText, setPixelText } from '../../ui/text';
import type { ResultsData } from './MatchScene';

/**
 * Local results. Offline matches never touch the backend/leaderboard: in online play the
 * result will be produced and signed by the realtime server, never by this screen.
 */
const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `${n}` : '+0');

export class ResultsScene extends Phaser.Scene {
  private cursor = 0;
  private options: Phaser.GameObjects.BitmapText[] = [];
  private results!: ResultsData;
  private get labels(): string[] {
    return this.results?.online ? ['JOGAR ONLINE DE NOVO', 'MENU PRINCIPAL'] : ['REVANCHE', 'TROCAR PERSONAGEM', 'MENU PRINCIPAL'];
  }

  constructor() {
    super('Results');
  }

  create(data: ResultsData): void {
    this.results = data;
    svc().input.flush();
    this.cursor = 0;
    new StageView(this, data.setup.stageId);
    this.cameras.main.setRoundPixels(true).setScroll(REF_CENTER.x - 320, REF_CENTER.y - 180 - 40);
    this.cameras.main.fadeIn(250, 26, 20, 34);
    this.add.rectangle(320, 180, 640, 360, PAL.ink, 0.5).setScrollFactor(0);

    const human = data.setup.slots.findIndex((s) => s.bot === null);
    const humanTeam = data.online ? data.online.youTeam : human >= 0 ? data.setup.slots[human].team : -99;
    const draw = data.winnerTeam < 0;
    const won = data.winnerTeam === humanTeam;
    const title = draw ? 'EMPATE' : human < 0 ? 'FIM DE JOGO' : won ? 'VITÓRIA!' : 'DERROTA';
    pixelText(this, 321, 23, title, { scale: 4, align: 'center', color: PAL.ink, depth: 5 });
    pixelText(this, 320, 20, title, { scale: 4, align: 'center', color: won ? PAL.gold[3] : draw ? PAL.steel[3] : PAL.fire[1], depth: 6 });
    const secs = Math.round(data.durationTicks / TICK_RATE);
    const mode = data.setup.mode === 'teams' ? 'TIMES 2V2' : data.fighters.length === 2 ? 'DUELO 1V1' : 'TODOS CONTRA TODOS';
    pixelText(this, 320, 70, `${getStage(data.setup.stageId).name} - ${mode} - ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, {
      align: 'center',
      color: PAL.sky[5],
      depth: 6,
    });

    const rows: [string, (f: ResultsData['fighters'][number]) => string][] = [
      ['ELIMINAÇÕES', (f) => String(f.stats.kos)],
      ['QUEDAS', (f) => String(f.stats.falls)],
      ['AUTODESTRUIÇÕES', (f) => String(f.stats.selfDestructs)],
      ['DANO CAUSADO', (f) => `${f.stats.damageDealt}%`],
      ['DANO RECEBIDO', (f) => `${f.stats.damageTaken}%`],
      ['GOLPES', (f) => String(f.stats.hitsLanded)],
      ['VIDAS', (f) => String(f.stocks)],
    ];
    const rated = data.fighters.some((f) => f.rating);
    if (rated) {
      rows.push(['RATING', (f) => (f.rating ? `${f.rating.after} ${signed(f.rating.after - f.rating.before)}` : '-')]);
    }
    const n = data.fighters.length;
    const colW = n > 2 ? 64 : 84;
    const firstCol = (n > 2 ? 262 : 290) + colW / 2;
    this.add.image(320, 172, ensurePanel(this, 400, 150)).setScrollFactor(0).setDepth(5);
    data.fighters.forEach((f, i) => {
      const x = firstCol + i * colW;
      const winner = !draw && f.team === data.winnerTeam;
      this.add.image(x, 110, `portrait_${f.characterId}_${f.color}`).setScrollFactor(0).setDepth(6);
      if (winner) pixelText(this, x, 92, '*', { align: 'center', color: PAL.gold[3], depth: 6 });
      pixelText(this, x, 122, f.label, { align: 'center', color: TEAM_RAMPS[f.color][3], depth: 6 });
      pixelText(this, x, 132, getCharacter(f.characterId).name.split(' ').slice(-1)[0], {
        align: 'center', outline: false, color: PAL.steel[3], depth: 6,
      });
    });
    rows.forEach(([label, get], r) => {
      const y = 148 + r * 11;
      pixelText(this, 132, y, label, { color: PAL.steel[3], depth: 6, outline: false });
      data.fighters.forEach((f, i) => pixelText(this, firstCol + i * colW, y, get(f), { align: 'center', depth: 6 }));
    });

    this.options = this.labels.map((label, i) => pixelText(this, 320, 262 + i * 14, label, { align: 'center', depth: 6 }));
    const footer = !data.online
      ? 'PARTIDAS OFFLINE NÃO CONTAM PARA O RANKING'
      : !data.online.recorded
        ? 'RESULTADO NÃO REGISTRADO (SERVIDOR INDISPONÍVEL)'
        : rated
          ? 'PARTIDA RANQUEADA - RATING ATUALIZADO PELO SERVIDOR'
          : data.online.ranked
            ? 'RESULTADO REGISTRADO - RATING SÓ ENTRE CONTAS'
            : 'RESULTADO VALIDADO E REGISTRADO PELO SERVIDOR';
    pixelText(this, 320, 340, footer, {
      align: 'center', outline: false, color: PAL.sky[3], depth: 6,
    });
    this.refresh();
  }

  private refresh() {
    this.options.forEach((t, i) => {
      setPixelText(t, i === this.cursor ? `> ${this.labels[i]} <` : this.labels[i]);
      t.setTint(i === this.cursor ? PAL.gold[3] : PAL.steel[3]);
    });
  }

  override update(): void {
    const { input, audio } = svc();
    input.update();
    const n = this.labels.length;
    if (input.wasPressed('up') || input.wasPressed('down')) {
      this.cursor = (this.cursor + (input.wasPressed('up') ? n - 1 : 1)) % n;
      audio.play('ui_move', 'ui');
      this.refresh();
    }
    if (input.wasPressed('confirm')) {
      audio.play('ui_confirm', 'ui');
      if (this.results.online) this.scene.start(this.cursor === 0 ? 'Online' : 'Title');
      else if (this.cursor === 0) this.scene.start('Match', this.results.setup);
      else if (this.cursor === 1) this.scene.start('Select', { setup: this.results.setup });
      else this.scene.start('Title');
    } else if (input.wasPressed('back')) {
      audio.play('ui_back', 'ui');
      this.scene.start('Title');
    }
  }
}
