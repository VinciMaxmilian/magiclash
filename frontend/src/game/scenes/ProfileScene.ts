import Phaser from 'phaser';
import { CHARACTERS, CHARACTER_ORDER } from '@magiclash/shared';
import { svc } from '../services';
import { StageView } from '../maps/StageView';
import { REF_CENTER } from '../maps/castleCourtyardArt';
import { PAL } from '../render/palette';
import { ensurePanel } from '../render/textures';
import { pixelText } from '../../ui/text';
import { DomForm } from '../../ui/domForm';
import { GUEST_NAME_RE, account, errorText, guestName, setGuestName, type Profile } from '../../services/account';

const QUEUE_LABEL: Record<string, string> = { '1v1': '1V1', ffa: 'FFA', '2v2': '2V2' };

/** Profile (account) or guest identity screen. */
export class ProfileScene extends Phaser.Scene {
  private dynamic: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Profile');
  }

  create(): void {
    svc().input.flush();
    this.dynamic = [];
    new StageView(this, 'castle_courtyard');
    this.cameras.main.setRoundPixels(true).setScroll(REF_CENTER.x - 320, REF_CENTER.y - 180 - 40);
    this.add.rectangle(320, 180, 640, 360, PAL.ink, 0.55).setScrollFactor(0);
    pixelText(this, 320, 10, 'PERFIL', { scale: 3, align: 'center', color: PAL.gold[3] });

    if (!account.signedIn) this.guestView();
    else if (account.profile) this.accountView(account.profile);
    else {
      const loading = pixelText(this, 320, 170, 'CARREGANDO...', { align: 'center' });
      account
        .refreshProfile()
        .then((p) => {
          loading.destroy();
          this.accountView(p);
        })
        .catch((e) => loading.setText(errorText(e)));
    }
  }

  private back() {
    svc().audio.play('ui_back', 'ui');
    this.scene.start('Title');
  }

  // ── Guest ─────────────────────────────────────────────────────────────────

  private guestView() {
    this.add.image(320, 180, ensurePanel(this, 300, 210)).setScrollFactor(0);
    pixelText(this, 320, 86, 'JOGANDO COMO VISITANTE', { align: 'center', color: PAL.steel[4] });
    pixelText(this, 320, 100, 'SEM RANKING NEM HISTÓRICO PERMANENTE', { align: 'center', outline: false, color: PAL.sky[4] });
    const form = new DomForm(
      [{ name: 'guest', label: 'Nome temporário (3-12, letras, números, _)', type: 'text', value: guestName() === 'VISITANTE' ? '' : guestName(), maxLength: 12 }],
      [
        [{ id: 'save', label: 'Salvar nome', submit: true }],
        [
          { id: 'login', label: 'Entrar', secondary: true },
          { id: 'register', label: 'Criar conta', secondary: true },
        ],
        [{ id: 'back', label: 'Voltar', secondary: true }],
      ],
      (id, f) => {
        if (id === 'back') return this.back();
        if (id === 'login' || id === 'register') {
          if (!account.configured) return f.message('CONTAS INDISPONÍVEIS NESTE BUILD');
          return this.scene.start('Auth', { mode: id });
        }
        const name = f.value('guest');
        if (!GUEST_NAME_RE.test(name)) return f.message('NOME: 3-12 LETRAS, NÚMEROS OU _');
        setGuestName(name);
        svc().audio.play('ui_confirm', 'ui');
        f.message('NOME SALVO!', true);
      },
    );
    this.add.dom(320, 200, form.el).setScrollFactor(0);
  }

  // ── Account ─────────────────────────────────────────────────────────────────

  private accountView(p: Profile) {
    this.dynamic.forEach((o) => o.destroy());
    this.dynamic = [];
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T) => {
      this.dynamic.push(o);
      return o;
    };

    // Left: identity + stats (canvas pixel text)
    keep(this.add.image(166, 190, ensurePanel(this, 300, 250)).setScrollFactor(0));
    const avatarKey = `portrait_${p.avatar_id}_blue`;
    const avatar = keep(this.add.image(58, 104, avatarKey).setScale(3).setScrollFactor(0));
    if (p.avatar_url) this.loadUploadedAvatar(p.avatar_url, avatar);
    keep(pixelText(this, 96, 80, p.username, { scale: 2, color: PAL.gold[3] }));
    keep(pixelText(this, 96, 104, `FAVORITO: ${CHARACTERS[p.favorite_character]?.name ?? '-'}`, { outline: false, color: PAL.steel[3] }));
    keep(pixelText(this, 96, 116, `DESDE ${new Date(p.created_at).toLocaleDateString('pt-BR')}`, { outline: false, color: PAL.sky[4] }));

    const s = p.stats;
    const rows: [string, string][] = [
      ['PARTIDAS', String(s.matches)],
      ['VITÓRIAS', String(s.wins)],
      ['DERROTAS', String(s.losses)],
      ['ELIMINAÇÕES', String(s.kos)],
      ['MORTES', String(s.deaths)],
    ];
    rows.forEach(([k, v], i) => {
      keep(pixelText(this, 34, 146 + i * 13, k, { color: PAL.steel[3] }));
      keep(pixelText(this, 150, 146 + i * 13, v, { align: 'right' }));
    });
    keep(pixelText(this, 190, 146, 'RANKING', { color: PAL.gold[2] }));
    p.ratings.forEach((r, i) => {
      keep(pixelText(this, 190, 159 + i * 13, QUEUE_LABEL[r.queue] ?? r.queue, { color: PAL.steel[3] }));
      keep(pixelText(this, 300, 159 + i * 13, String(r.rating), { align: 'right' }));
    });
    keep(pixelText(this, 34, 290, 'ESTATÍSTICAS E RANKING SÃO', { outline: false, color: PAL.sky[3] }));
    keep(pixelText(this, 34, 300, 'CALCULADOS SÓ PELO SERVIDOR', { outline: false, color: PAL.sky[3] }));

    // Right: edit form (HTML)
    const chars = CHARACTER_ORDER.map((id) => ({ value: id, label: CHARACTERS[id].name }));
    const form = new DomForm(
      [
        { name: 'username', label: 'Nome de usuário', type: 'text', value: p.username, maxLength: 16 },
        { name: 'favorite', label: 'Personagem favorito', options: chars, value: p.favorite_character },
        { name: 'avatar', label: 'Avatar padrão', options: chars, value: p.avatar_id },
        { name: 'file', label: 'Ou envie uma imagem (PNG/WEBP, até 512 KB)', type: 'file', accept: 'image/png,image/webp' },
      ],
      [
        [
          { id: 'save', label: 'Salvar', submit: true },
          { id: 'upload', label: 'Enviar imagem' },
        ],
        [
          { id: 'logout', label: 'Sair da conta', secondary: true },
          { id: 'back', label: 'Voltar', secondary: true },
        ],
      ],
      (id, f) => void this.onButton(id, f, p),
    );
    keep(this.add.image(480, 190, ensurePanel(this, 262, 250)).setScrollFactor(0));
    keep(this.add.dom(480, 196, form.el).setScrollFactor(0));
  }

  private loadUploadedAvatar(url: string, target: Phaser.GameObjects.Image) {
    const key = `avatar_${url}`;
    const apply = () => target.setTexture(key).setScale(48 / Math.max(1, this.textures.get(key).getSourceImage().width));
    if (this.textures.exists(key)) return apply();
    this.load.setCORS('anonymous');
    this.load.image(key, url);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (this.textures.exists(key)) apply();
    });
    this.load.start();
  }

  private async onButton(id: string, form: DomForm, p: Profile) {
    const { audio } = svc();
    if (id === 'back') return this.back();
    form.busy(true);
    try {
      if (id === 'logout') {
        await account.signOut();
        audio.play('ui_back', 'ui');
        this.scene.restart();
        return;
      }
      if (id === 'upload') {
        const file = form.file('file');
        if (!file) {
          form.message('ESCOLHA UMA IMAGEM');
          form.busy(false);
          return;
        }
        const updated = await account.uploadAvatar(file);
        audio.play('ui_confirm', 'ui');
        this.accountView(updated);
        return;
      }
      const changes: Parameters<typeof account.updateProfile>[0] = {};
      const username = form.value('username');
      if (username !== p.username) changes.username = username;
      if (form.value('favorite') !== p.favorite_character) changes.favorite_character = form.value('favorite');
      if (form.value('avatar') !== p.avatar_id) changes.avatar_id = form.value('avatar');
      if (Object.keys(changes).length === 0) {
        form.message('NADA PARA SALVAR');
        form.busy(false);
        return;
      }
      const updated = await account.updateProfile(changes);
      audio.play('ui_confirm', 'ui');
      this.accountView(updated);
    } catch (e) {
      form.message(errorText(e));
      form.busy(false);
    }
  }
}
