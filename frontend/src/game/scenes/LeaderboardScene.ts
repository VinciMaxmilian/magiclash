import Phaser from 'phaser';
import { CHARACTERS, CHARACTER_ORDER } from '@magiclash/shared';
import { svc } from '../services';
import { StageView } from '../maps/StageView';
import { REF_CENTER } from '../maps/castleCourtyardArt';
import { PAL } from '../render/palette';
import { ensurePanel } from '../render/textures';
import { loadAvatarTexture } from '../render/avatars';
import { pixelText, setPixelText } from '../../ui/text';
import { account } from '../../services/account';
import { fetchLeaderboard, type Leaderboard, type LeaderboardEntry, type LeaderboardPeriod } from '../../services/leaderboard';

interface Tab {
  period: LeaderboardPeriod;
  character: string | null;
  label: string;
  /** Header of the score column. */
  score: string;
}

const TABS: Tab[] = [
  { period: 'season', character: null, label: 'TEMPORADA', score: 'RATING' },
  { period: 'week', character: null, label: 'SEMANA', score: 'GANHO' },
  { period: 'month', character: null, label: 'MÊS', score: 'GANHO' },
  ...CHARACTER_ORDER.map((id) => ({ period: 'character' as const, character: id, label: `CLASSE: ${CHARACTERS[id].name.toUpperCase()}`, score: 'VITÓRIAS' })),
];

const ROWS = 10;
const ROW_H = 20;
const TOP = 86;
const COL = { pos: 118, avatar: 146, name: 162, score: 396, wl: 452, matches: 516 };

/**
 * Ranked 1v1 leaderboards: season rating, rating gained this week/month, wins per class.
 * Everything shown comes from the server; nothing here is computed from local data.
 */
export class LeaderboardScene extends Phaser.Scene {
  private tab = 0;
  private request = 0;
  private body!: Phaser.GameObjects.Container;
  private tabText!: Phaser.GameObjects.BitmapText;
  private scoreHeader!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('Leaderboard');
  }

  create(): void {
    svc().input.flush();
    new StageView(this, 'castle_courtyard');
    this.cameras.main.setRoundPixels(true).setScroll(REF_CENTER.x - 320, REF_CENTER.y - 180 - 40);
    this.add.rectangle(320, 180, 640, 360, PAL.ink, 0.55).setScrollFactor(0);

    pixelText(this, 321, 15, 'RANKING 1V1', { scale: 3, align: 'center', color: PAL.ink, depth: 5 });
    pixelText(this, 320, 12, 'RANKING 1V1', { scale: 3, align: 'center', color: PAL.gold[3], depth: 6 });
    this.add.image(320, 190, ensurePanel(this, 460, 262)).setScrollFactor(0).setDepth(4);
    this.tabText = pixelText(this, 320, 50, '', { align: 'center', color: PAL.gold[3], depth: 6 });

    const header = (x: number, text: string, align: 'left' | 'center' | 'right' = 'left') =>
      pixelText(this, x, 70, text, { align, outline: false, color: PAL.steel[3], depth: 6 });
    header(COL.pos, '#', 'center');
    header(COL.name, 'JOGADOR');
    this.scoreHeader = header(COL.score, '', 'right');
    header(COL.wl, 'V-D', 'center');
    header(COL.matches, 'JOGOS', 'right');

    this.body = this.add.container(0, 0).setScrollFactor(0).setDepth(6);
    pixelText(this, 320, 334, '<- -> TROCAR RANKING     ESC VOLTAR', { align: 'center', outline: false, color: PAL.sky[3], depth: 6 });
    if (!account.signedIn) {
      pixelText(this, 320, 346, 'ENTRE COM UMA CONTA PARA APARECER NO RANKING', {
        align: 'center', outline: false, color: PAL.steel[3], depth: 6,
      });
    }
    this.fetchBoard();
  }

  private fetchBoard(): void {
    const tab = TABS[this.tab];
    setPixelText(this.tabText, `<  ${tab.label}  >`);
    setPixelText(this.scoreHeader, tab.score);
    this.showMessage('CARREGANDO...');
    const id = ++this.request;
    fetchLeaderboard(tab.period, tab.character, ROWS)
      .then((board) => {
        if (id === this.request && this.scene.isActive()) this.showBoard(board);
      })
      .catch(() => {
        if (id === this.request && this.scene.isActive()) this.showMessage('RANKING INDISPONÍVEL NO MOMENTO');
      });
  }

  private showMessage(text: string): void {
    this.body.removeAll(true);
    this.body.add(pixelText(this, 320, 170, text, { align: 'center', color: PAL.steel[3], fixed: false }));
  }

  private showBoard(board: Leaderboard): void {
    this.body.removeAll(true);
    if (board.entries.length === 0) {
      this.showMessage('NINGUÉM PONTUOU AINDA - JOGUE A FILA 1V1 COM CONTA');
      return;
    }
    board.entries.forEach((e, i) => this.row(e, TOP + i * ROW_H));
    if (board.me && !board.entries.some((e) => e.me)) {
      const y = TOP + ROWS * ROW_H + 4;
      this.body.add(this.add.rectangle(320, y - 3, 420, 1, PAL.steel[1]).setOrigin(0.5, 0));
      this.row(board.me, y + 2);
    }
  }

  private row(e: LeaderboardEntry, y: number): void {
    const color = e.me ? PAL.gold[3] : e.position <= 3 ? PAL.gold[2] : 0xeef2f7;
    if (e.me) this.body.add(this.add.rectangle(320, y + 9, 440, ROW_H - 2, PAL.gold[0], 0.35));
    const t = (x: number, text: string, align: 'left' | 'center' | 'right' = 'left', tint = color) =>
      this.body.add(pixelText(this, x, y + 5, text, { align, color: tint, fixed: false }));

    t(COL.pos, String(e.position), 'center');
    const portrait = this.add.image(COL.avatar, y + 9, `portrait_${e.avatar_id}_blue`);
    this.body.add(portrait);
    if (e.avatar_url) {
      void loadAvatarTexture(this, e.avatar_url, 18).then((key) => {
        if (key && portrait.active) portrait.setTexture(key);
      });
    }
    t(COL.name, e.username.toUpperCase());
    const tab = TABS[this.tab];
    t(COL.score, tab.period === 'week' || tab.period === 'month' ? (e.score > 0 ? `+${e.score}` : String(e.score)) : String(e.score), 'right');
    t(COL.wl, `${e.wins}-${e.losses}`, 'center', PAL.steel[3]);
    t(COL.matches, String(e.matches), 'right', PAL.steel[3]);
  }

  override update(): void {
    const { input, audio } = svc();
    input.update();
    if (input.wasPressed('left') || input.wasPressed('right')) {
      this.tab = (this.tab + (input.wasPressed('left') ? TABS.length - 1 : 1)) % TABS.length;
      audio.play('ui_move', 'ui');
      this.fetchBoard();
    } else if (input.wasPressed('back') || input.wasPressed('confirm')) {
      audio.play('ui_back', 'ui');
      this.scene.start('Title');
    }
  }
}
