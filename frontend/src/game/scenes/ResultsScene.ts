import Phaser from 'phaser';
import { TICK_RATE } from '@magiclash/shared';
import { svc } from '../services';
import { StageView } from '../maps/StageView';
import { REF_CENTER } from '../maps/castleCourtyardArt';
import { PAL, TEAM_RAMPS } from '../render/palette';
import { ensurePanel } from '../render/textures';
import { pixelText, setPixelText } from '../../ui/text';
import type { ResultsData } from './MatchScene';
import { DIFFICULTY_LABEL } from './labels';

/**
 * Local results. Offline matches never touch the backend/leaderboard: in online play the
 * result will be produced and signed by the realtime server, never by this screen.
 */
export class ResultsScene extends Phaser.Scene {
  private cursor = 0;
  private options: Phaser.GameObjects.BitmapText[] = [];
  private results!: ResultsData;

  constructor() {
    super('Results');
  }

  create(data: ResultsData): void {
    this.results = data;
    svc().input.flush();
    this.cursor = 0;
    new StageView(this, 'castle_courtyard');
    this.cameras.main.setRoundPixels(true).setScroll(REF_CENTER.x - 320, REF_CENTER.y - 180 - 40);
    this.cameras.main.fadeIn(250, 26, 20, 34);
    this.add.rectangle(320, 180, 640, 360, PAL.ink, 0.45).setScrollFactor(0);

    const won = data.winnerTeam === data.playerTeam;
    const draw = data.winnerTeam < 0;
    const title = draw ? 'EMPATE' : won ? 'VITÓRIA!' : 'DERROTA';
    pixelText(this, 321, 29, title, { scale: 4, align: 'center', color: PAL.ink, depth: 5 });
    pixelText(this, 320, 26, title, { scale: 4, align: 'center', color: won ? PAL.gold[3] : draw ? PAL.steel[3] : PAL.fire[1], depth: 6 });
    const secs = Math.round(data.durationTicks / TICK_RATE);
    pixelText(this, 320, 76, `CASTLE COURTYARD - BOT ${DIFFICULTY_LABEL[data.difficulty]} - ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, {
      align: 'center',
      color: PAL.sky[5],
      depth: 6,
    });

    const rows: [string, (s: ResultsData['fighters'][number]) => string][] = [
      ['ELIMINAÇÕES', (f) => String(f.stats.kos)],
      ['QUEDAS', (f) => String(f.stats.falls)],
      ['AUTODESTRUIÇÕES', (f) => String(f.stats.selfDestructs)],
      ['DANO CAUSADO', (f) => `${f.stats.damageDealt}%`],
      ['DANO RECEBIDO', (f) => `${f.stats.damageTaken}%`],
      ['GOLPES ACERTADOS', (f) => String(f.stats.hitsLanded)],
      ['VIDAS RESTANTES', (f) => String(f.stocks)],
    ];
    this.add.image(320, 176, ensurePanel(this, 360, 150)).setScrollFactor(0).setDepth(5);
    data.fighters.forEach((f, i) => {
      const x = 400 + i * 80;
      this.add.image(x, 116, `portrait_${f.team}`).setScrollFactor(0).setDepth(6);
      pixelText(this, x, 128, f.name, { align: 'center', color: TEAM_RAMPS[f.team][3], depth: 6 });
    });
    rows.forEach(([label, get], r) => {
      const y = 146 + r * 12;
      pixelText(this, 160, y, label, { color: PAL.steel[3], depth: 6, outline: false });
      data.fighters.forEach((f, i) => pixelText(this, 400 + i * 80, y, get(f), { align: 'center', depth: 6 }));
    });

    this.options = ['REVANCHE', 'MENU PRINCIPAL'].map((label, i) =>
      pixelText(this, 320, 272 + i * 14, label, { align: 'center', depth: 6 }),
    );
    pixelText(this, 320, 336, 'RESULTADO LOCAL - PARTIDAS OFFLINE NÃO CONTAM PARA O RANKING', {
      align: 'center',
      outline: false,
      color: PAL.sky[3],
      depth: 6,
    });
    this.refresh();
  }

  private refresh() {
    const labels = ['REVANCHE', 'MENU PRINCIPAL'];
    this.options.forEach((t, i) => {
      setPixelText(t, i === this.cursor ? `> ${labels[i]} <` : labels[i]);
      t.setTint(i === this.cursor ? PAL.gold[3] : PAL.steel[3]);
    });
  }

  override update(): void {
    const { input, audio } = svc();
    input.update();
    if (input.wasPressed('up') || input.wasPressed('down')) {
      this.cursor = 1 - this.cursor;
      audio.play('ui_move', 'ui');
      this.refresh();
    }
    if (input.wasPressed('confirm')) {
      audio.play('ui_confirm', 'ui');
      if (this.cursor === 0) this.scene.start('Match', { difficulty: this.results.difficulty });
      else this.scene.start('Title');
    } else if (input.wasPressed('back')) {
      audio.play('ui_back', 'ui');
      this.scene.start('Title');
    }
  }
}
