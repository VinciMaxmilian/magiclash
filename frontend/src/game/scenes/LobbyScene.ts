import Phaser from 'phaser';
import { CHARACTERS, CHARACTER_ORDER, COLORS, STAGES, type ColorId, type LobbyPlayer, type ServerMsg } from '@magiclash/shared';
import { svc } from '../services';
import { StageView } from '../maps/StageView';
import { REF_CENTER } from '../maps/castleCourtyardArt';
import { PAL, TEAM_RAMPS } from '../render/palette';
import { ensurePanel } from '../render/textures';
import { pixelText, setPixelText } from '../../ui/text';
import type { NetClient } from '../net/NetClient';
import type { JoinInfo } from '../../services/online';

const COLOR_LABEL: Record<ColorId, string> = { blue: 'AZUL', red: 'VERMELHO', green: 'VERDE', yellow: 'AMARELO' };
const AUTO_READY_SECONDS = 20;

/** Pre-match lobby: pick character/color (and team in 2v2), ready up. The server starts the match. */
export class LobbyScene extends Phaser.Scene {
  private client!: NetClient;
  private join!: JoinInfo;
  private players: LobbyPlayer[] = [];
  private rows: Phaser.GameObjects.GameObject[] = [];
  private character = 0;
  private color: ColorId = 'blue';
  private ready = false;
  private status!: Phaser.GameObjects.BitmapText;
  private off: (() => void)[] = [];
  private autoReadyAt = 0;

  constructor() {
    super('Lobby');
  }

  create(data: { client: NetClient; join: JoinInfo }): void {
    this.client = data.client;
    this.join = data.join;
    this.players = [];
    this.rows = [];
    this.ready = false;
    this.off = [];
    svc().input.flush();
    new StageView(this, this.join.stage);
    this.cameras.main.setRoundPixels(true).setScroll(REF_CENTER.x - 320, REF_CENTER.y - 180 - 40);
    this.add.rectangle(320, 180, 640, 360, PAL.ink, 0.55).setScrollFactor(0);

    const w = this.client.welcome;
    const title = w.room ? `SALA ${w.room}` : 'PARTIDA RÁPIDA';
    pixelText(this, 320, 12, title, { scale: 3, align: 'center', color: PAL.gold[3] });
    const mode = w.mode === 'teams' ? 'TIMES 2V2' : w.maxPlayers === 2 ? 'DUELO 1V1' : 'TODOS CONTRA TODOS';
    pixelText(this, 320, 44, `${mode} - ${STAGES[w.stage]?.name ?? w.stage} - ${w.stocks} ${w.stocks === 1 ? 'VIDA' : 'VIDAS'}`, { align: 'center', color: PAL.sky[5] });
    if (w.room) pixelText(this, 320, 58, 'COMPARTILHE O CÓDIGO COM SEUS AMIGOS', { align: 'center', outline: false, color: PAL.sky[4] });
    this.add.image(320, 170, ensurePanel(this, 440, 170)).setScrollFactor(0);
    this.status = pixelText(this, 320, 268, '', { align: 'center', color: PAL.steel[4] });
    pixelText(
      this,
      320,
      330,
      `~ | LUTADOR   { } COR   ${w.mode === 'teams' ? 'T TIME   ' : ''}ENTER PRONTO   ESC SAIR`,
      { align: 'center', color: PAL.sky[3] },
    );
    this.autoReadyAt = w.room ? 0 : this.time.now + AUTO_READY_SECONDS * 1000;

    this.off.push(
      this.client.on('lobby', (m) => {
        this.players = m.players;
        const me = m.players.find((p) => p.slot === w.slot);
        if (me) {
          this.color = me.color;
          this.character = Math.max(0, CHARACTER_ORDER.indexOf(me.character as (typeof CHARACTER_ORDER)[number]));
          this.ready = me.ready;
        }
        this.renderPlayers();
      }),
      this.client.on('start', (m) => this.startMatch(m)),
      this.client.on('error', (m) => setPixelText(this.status, m.code.toUpperCase())),
      this.client.onClose(() => {
        if (this.scene.isActive()) this.scene.start('Online', { message: 'CONEXÃO COM A SALA ENCERRADA' });
      }),
    );
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.code === 'KeyT' && !e.repeat && w.mode === 'teams' && !(t && t.tagName === 'INPUT')) this.switchTeam();
    };
    window.addEventListener('keydown', onKey);
    this.off.push(() => window.removeEventListener('keydown', onKey));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.off.forEach((f) => f()));
    this.renderPlayers();
  }

  private renderPlayers() {
    this.rows.forEach((o) => o.destroy());
    this.rows = [];
    const w = this.client.welcome;
    for (let slot = 0; slot < w.maxPlayers; slot++) {
      const p = this.players.find((x) => x.slot === slot);
      const y = 104 + slot * 36;
      if (!p) {
        this.rows.push(pixelText(this, 130, y, '- AGUARDANDO JOGADOR -', { color: PAL.stone[3] }));
        continue;
      }
      const ramp = TEAM_RAMPS[p.color];
      this.rows.push(this.add.image(126, y + 4, `portrait_${p.character}_${p.color}`).setScrollFactor(0));
      this.rows.push(pixelText(this, 144, y - 4, `${p.name}${p.slot === w.slot ? ' (VOCÊ)' : ''}`, { color: ramp[3] }));
      this.rows.push(
        pixelText(this, 144, y + 8, `${CHARACTERS[p.character]?.name ?? p.character} - ${COLOR_LABEL[p.color]}${w.mode === 'teams' ? ` - TIME ${p.team + 1}` : ''}`, {
          outline: false, color: PAL.steel[3],
        }),
      );
      const state = !p.connected ? 'DESCONECTADO' : p.ready ? 'PRONTO' : '...';
      this.rows.push(pixelText(this, 520, y, state, { align: 'right', color: p.ready ? PAL.moss[3] : PAL.steel[3] }));
    }
    const n = this.players.length;
    const need = w.mode === 'teams' ? 4 : w.maxPlayers === 2 ? 2 : 2;
    setPixelText(
      this.status,
      n < need ? `AGUARDANDO JOGADORES (${n}/${w.maxPlayers})` : this.ready ? 'AGUARDANDO OS OUTROS...' : 'APERTE ENTER QUANDO ESTIVER PRONTO',
    );
  }

  private pick() {
    this.client.send({ t: 'pick', character: CHARACTER_ORDER[this.character], color: this.color });
  }

  override update(): void {
    const { input, audio } = svc();
    input.update();
    const n = CHARACTER_ORDER.length;
    if (input.wasPressed('left') || input.wasPressed('right')) {
      this.character = (this.character + (input.wasPressed('left') ? n - 1 : 1)) % n;
      this.pick();
      audio.play('ui_move', 'ui');
    } else if (input.wasPressed('up') || input.wasPressed('down')) {
      const i = COLORS.indexOf(this.color);
      this.color = COLORS[(i + (input.wasPressed('up') ? COLORS.length - 1 : 1)) % COLORS.length];
      this.pick();
      audio.play('ui_move', 'ui');
    } else if (input.wasPressed('confirm')) {
      this.client.send({ t: 'ready', ready: !this.ready });
      audio.play('ui_confirm', 'ui');
    } else if (input.wasPressed('back')) {
      audio.play('ui_back', 'ui');
      this.client.close();
      this.scene.start('Online');
    }
    // Quick match: auto-ready so an idle player doesn't block the opponent forever.
    if (this.autoReadyAt && this.time.now > this.autoReadyAt && !this.ready) {
      this.autoReadyAt = 0;
      this.client.send({ t: 'ready', ready: true });
    }
  }

  switchTeam(): void {
    const me = this.players.find((p) => p.slot === this.client.welcome.slot);
    if (me) this.client.send({ t: 'team', team: me.team === 0 ? 1 : 0 });
  }

  private startMatch(m: Extract<ServerMsg, { t: 'start' }>) {
    this.off.forEach((f) => f());
    this.off = [];
    this.scene.start('Match', { net: { client: this.client, start: m, join: this.join } });
  }
}
