import Phaser from 'phaser';
import { STAGES, STAGE_ORDER } from '@magiclash/shared';
import { svc } from '../services';
import { StageView } from '../maps/StageView';
import { REF_CENTER } from '../maps/castleCourtyardArt';
import { PAL } from '../render/palette';
import { ensurePanel } from '../render/textures';
import { pixelText } from '../../ui/text';
import { DomForm } from '../../ui/domForm';
import { account, displayName, errorText } from '../../services/account';
import { online, type JoinInfo } from '../../services/online';
import { NetClient } from '../net/NetClient';

/** Online hub: quick match (1v1 matchmaking), create a private room, or join by code. */
export class OnlineScene extends Phaser.Scene {
  private form!: DomForm;
  private ticket: string | null = null;
  private pollTimer: Phaser.Time.TimerEvent | null = null;
  private busy = false;

  constructor() {
    super('Online');
  }

  create(data: { message?: string }): void {
    svc().input.flush();
    this.ticket = null;
    this.busy = false;
    new StageView(this, 'castle_courtyard');
    this.cameras.main.setRoundPixels(true).setScroll(REF_CENTER.x - 320, REF_CENTER.y - 180 - 40);
    this.add.rectangle(320, 180, 640, 360, PAL.ink, 0.55).setScrollFactor(0);
    pixelText(this, 320, 12, 'ONLINE', { scale: 3, align: 'center', color: PAL.gold[3] });
    pixelText(this, 320, 44, `JOGANDO COMO ${displayName()}${account.signedIn ? '' : ' (VISITANTE)'}`, {
      align: 'center', outline: false, color: PAL.sky[4],
    });
    this.add.image(320, 196, ensurePanel(this, 300, 262)).setScrollFactor(0);

    this.form = new DomForm(
      [
        { name: 'code', label: 'Código da sala', type: 'text', maxLength: 6 },
        {
          name: 'mode',
          label: 'Nova sala: modo',
          options: [
            { value: 'duel', label: 'Duelo 1v1' },
            { value: 'ffa', label: 'Todos contra todos (até 4)' },
            { value: 'teams', label: 'Times 2v2' },
          ],
        },
        { name: 'stage', label: 'Mapa', options: STAGE_ORDER.map((id) => ({ value: id, label: STAGES[id].name })) },
        { name: 'stocks', label: 'Vidas', options: ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v })), value: '3' },
      ],
      [
        [
          { id: 'join', label: 'Entrar com código', submit: true },
          { id: 'create', label: 'Criar sala' },
        ],
        [{ id: 'quick', label: 'Partida rápida 1v1' }],
        [{ id: 'back', label: 'Voltar', secondary: true }],
      ],
      (id) => void this.onButton(id),
    );
    this.add.dom(320, 198, this.form.el).setScrollFactor(0);
    if (!online.available) this.form.message('ONLINE INDISPONÍVEL NESTE BUILD');
    if (data?.message) this.form.message(data.message);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stopSearch());
  }

  private async onButton(id: string) {
    const { audio } = svc();
    if (id === 'back') {
      if (this.ticket) {
        this.stopSearch();
        this.form.message('BUSCA CANCELADA');
        return;
      }
      audio.play('ui_back', 'ui');
      this.scene.start('Title');
      return;
    }
    if (this.busy || !online.available) return;
    this.busy = true;
    this.form.busy(true);
    try {
      if (id === 'join') {
        this.form.message('ENTRANDO...', true);
        await this.connect(await online.joinRoom(this.form.value('code')));
      } else if (id === 'create') {
        this.form.message('CRIANDO SALA...', true);
        const join = await online.createRoom(
          this.form.value('mode') as 'duel' | 'ffa' | 'teams',
          this.form.value('stage'),
          Number(this.form.value('stocks')),
        );
        await this.connect(join);
      } else if (id === 'quick') {
        const t = await online.enqueue();
        if (t.status === 'matched' && t.join) return void (await this.connect(t.join));
        this.ticket = t.ticket_id;
        this.form.message('PROCURANDO ADVERSÁRIO... (VOLTAR CANCELA)', true);
        this.form.busy(false);
        this.el('back').disabled = false;
        this.pollTimer = this.time.addEvent({ delay: 1500, loop: true, callback: () => void this.pollTicket() });
        return;
      }
    } catch (e) {
      this.form.message(errorText(e));
    }
    this.busy = false;
    this.form.busy(false);
  }

  private el(id: string): HTMLButtonElement {
    return this.form.el.querySelector(`button[data-id=${id}]`) as HTMLButtonElement;
  }

  private async pollTicket() {
    if (!this.ticket) return;
    try {
      const t = await online.poll(this.ticket);
      if (t.status === 'matched' && t.join) {
        this.stopSearch(false);
        this.form.message('ADVERSÁRIO ENCONTRADO!', true);
        await this.connect(t.join);
      } else if (t.status !== 'searching') {
        this.stopSearch(false);
        this.form.message('BUSCA EXPIRADA. TENTE DE NOVO');
      }
    } catch (e) {
      this.stopSearch(false);
      this.form.message(errorText(e));
    }
  }

  private stopSearch(cancelRemote = true) {
    this.pollTimer?.remove();
    this.pollTimer = null;
    if (this.ticket && cancelRemote) void online.cancel(this.ticket);
    this.ticket = null;
    this.busy = false;
    if (this.form) this.form.busy(false);
  }

  private async connect(join: JoinInfo) {
    const client = await NetClient.connect(join.realtime_url, join.token);
    svc().audio.play('ui_confirm', 'ui');
    this.scene.start('Lobby', { client, join });
  }
}
