import Phaser from 'phaser';
import { svc } from '../services';
import { StageView } from '../maps/StageView';
import { REF_CENTER } from '../maps/castleCourtyardArt';
import { PAL } from '../render/palette';
import { ensurePanel } from '../render/textures';
import { pixelText } from '../../ui/text';
import { DomForm } from '../../ui/domForm';
import { account, errorText } from '../../services/account';

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Login / Register (email + password via Supabase Auth). */
export class AuthScene extends Phaser.Scene {
  private mode: 'login' | 'register' = 'login';

  constructor() {
    super('Auth');
  }

  create(data: { mode?: 'login' | 'register' }): void {
    this.mode = data?.mode ?? 'login';
    svc().input.flush();
    new StageView(this, 'castle_courtyard');
    this.cameras.main.setRoundPixels(true).setScroll(REF_CENTER.x - 320, REF_CENTER.y - 180 - 40);
    this.add.rectangle(320, 180, 640, 360, PAL.ink, 0.55).setScrollFactor(0);
    this.add.image(320, 186, ensurePanel(this, 280, this.mode === 'register' ? 236 : 200)).setScrollFactor(0);
    pixelText(this, 320, 26, this.mode === 'register' ? 'CRIAR CONTA' : 'ENTRAR', { scale: 3, align: 'center', color: PAL.gold[3] });
    pixelText(this, 320, 342, 'CONTAS GUARDAM PERFIL, ESTATÍSTICAS E RANKING', { align: 'center', outline: false, color: PAL.sky[3] });

    if (!account.configured) {
      pixelText(this, 320, 170, 'CONTAS INDISPONÍVEIS NESTE BUILD', { align: 'center', color: PAL.fire[3] });
      return;
    }

    const register = this.mode === 'register';
    const form = new DomForm(
      [
        ...(register
          ? [{ name: 'username', label: 'Nome de usuário (3-16, letras, números, _)', type: 'text' as const, maxLength: 16, autocomplete: 'username' }]
          : []),
        { name: 'email', label: 'Email', type: 'email', maxLength: 254, autocomplete: 'email' },
        { name: 'password', label: 'Senha', type: 'password', maxLength: 72, autocomplete: register ? 'new-password' : 'current-password' },
      ],
      [
        [{ id: 'submit', label: register ? 'Criar conta' : 'Entrar', submit: true }],
        [
          { id: 'toggle', label: register ? 'Já tenho conta' : 'Criar conta', secondary: true },
          { id: 'back', label: 'Voltar', secondary: true },
        ],
      ],
      (id, f) => void this.onButton(id, f),
    );
    this.add.dom(320, 192, form.el).setScrollFactor(0);
    this.time.delayedCall(50, () => form.focusFirst());
  }

  private async onButton(id: string, form: DomForm) {
    const { audio } = svc();
    if (id === 'back') {
      audio.play('ui_back', 'ui');
      this.scene.start('Title');
      return;
    }
    if (id === 'toggle') {
      audio.play('ui_move', 'ui');
      this.scene.restart({ mode: this.mode === 'login' ? 'register' : 'login' });
      return;
    }
    const email = form.value('email');
    const password = form.value('password');
    const username = form.value('username');
    if (this.mode === 'register' && !USERNAME_RE.test(username)) return form.message('NOME: 3-16 LETRAS, NÚMEROS OU _');
    if (!EMAIL_RE.test(email)) return form.message('EMAIL INVÁLIDO');
    if (password.length < 8) return form.message('SENHA: MÍNIMO 8 CARACTERES');

    form.busy(true);
    form.message('AGUARDE...', true);
    try {
      if (this.mode === 'register') {
        const r = await account.signUp(email, password, username);
        if (r === 'confirm_email') {
          form.message('CONTA CRIADA! CONFIRME PELO EMAIL E ENTRE.', true);
          form.busy(false);
          return;
        }
      } else {
        await account.signIn(email, password);
      }
      audio.play('ui_confirm', 'ui');
      this.scene.start('Profile');
    } catch (e) {
      form.message(errorText(e));
      form.busy(false);
    }
  }
}
