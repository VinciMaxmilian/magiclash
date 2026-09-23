import Phaser from 'phaser';
import { svc } from '../services';
import { StageView } from '../maps/StageView';
import { REF_CENTER } from '../maps/castleCourtyardArt';
import { ensurePanel } from '../render/textures';
import { pixelText, setPixelText } from '../../ui/text';
import { CONTROL_HINTS } from '../input/actions';

type Item = { label: () => string; adjust?: (dir: -1 | 1) => void; confirm?: () => void };

export class TitleScene extends Phaser.Scene {
  private items: Item[] = [];
  private texts: Phaser.GameObjects.BitmapText[] = [];
  private cursor = 0;
  private controls!: Phaser.GameObjects.Container;
  private t = 0;
  private stageView!: StageView;
  private starting = false;

  constructor() {
    super('Title');
  }

  create(): void {
    const s = svc();
    s.input.flush();
    this.cursor = 0;
    this.t = 0;
    this.starting = false;
    this.stageView = new StageView(this, 'castle_courtyard');
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setScroll(REF_CENTER.x - 320, REF_CENTER.y - 180 - 40);

    // Logo: outlined pixel text, gold, with a drop line in ink (no blur).
    pixelText(this, 321, 41, 'MAGICLASH', { scale: 4, align: 'center', color: 0x1a1422, depth: 10 });
    pixelText(this, 320, 38, 'MAGICLASH', { scale: 4, align: 'center', color: 0xf2d27a, depth: 11 });
    this.add.rectangle(320, 94, 196, 14, 0x1a1422, 0.75).setScrollFactor(0).setDepth(10);
    pixelText(this, 320, 88, 'DUELOS NO PÁTIO DO CASTELO', { align: 'center', color: 0xeea57e, depth: 11 });

    const vol = (k: 'masterVolume' | 'sfxVolume' | 'musicVolume') => (dir: -1 | 1) => {
      s.settings[k] = Math.round(Math.min(1, Math.max(0, s.settings[k] + dir * 0.1)) * 10) / 10;
      s.saveSettings();
    };
    this.items = [
      { label: () => 'JOGAR (SINGLEPLAYER)', confirm: () => this.startMatch() },
      { label: () => `VOLUME GERAL  < ${Math.round(s.settings.masterVolume * 100)}% >`, adjust: vol('masterVolume') },
      { label: () => `EFEITOS       < ${Math.round(s.settings.sfxVolume * 100)}% >`, adjust: vol('sfxVolume') },
      { label: () => `MÚSICA        < ${Math.round(s.settings.musicVolume * 100)}% >`, adjust: vol('musicVolume') },
      { label: () => 'CONTROLES', confirm: () => this.controls.setVisible(!this.controls.visible) },
      { label: () => (this.scale.isFullscreen ? 'SAIR DA TELA CHEIA' : 'TELA CHEIA (F)'), confirm: () => this.scale.toggleFullscreen() },
    ];

    this.add.image(320, 196, ensurePanel(this, 260, 104)).setScrollFactor(0).setDepth(10);
    this.texts = this.items.map((it, i) =>
      pixelText(this, 206, 154 + i * 14, it.label(), { depth: 11, color: 0xb7c2d6 }),
    );

    pixelText(this, 320, 336, '{ } ESCOLHER   ~ | AJUSTAR   ENTER CONFIRMAR', {
      align: 'center',
      color: 0x8f5b8c,
      depth: 11,
    });
    pixelText(this, 634, 348, 'FASE 1 - VERTICAL SLICE', { align: 'right', outline: false, color: 0x5a3f7a, depth: 11 });

    // Controls panel
    this.controls = this.add.container(0, 0).setDepth(20);
    this.controls.add(this.add.image(320, 200, ensurePanel(this, 300, 176)));
    this.controls.add(pixelText(this, 320, 122, 'CONTROLES', { align: 'center', color: 0xf2d27a, fixed: false }));
    CONTROL_HINTS.forEach(([a, k], i) => {
      this.controls.add(pixelText(this, 190, 142 + i * 14, a, { color: 0xb7c2d6, fixed: false }));
      this.controls.add(pixelText(this, 450, 142 + i * 14, k, { color: 0xeef2f7, align: 'right', fixed: false }));
    });
    this.controls.add(
      pixelText(this, 320, 262, 'DIREÇÃO + ATAQUE = GOLPES DIRECIONAIS', { align: 'center', color: 0xeea57e, fixed: false }),
    );
    this.controls.setScrollFactor(0, 0, true).setVisible(false);
    this.refresh();
  }

  private startMatch() {
    if (this.starting) return;
    this.starting = true;
    this.cameras.main.fadeOut(200, 26, 20, 34);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.start('Select'),
    );
  }

  private refresh() {
    this.texts.forEach((t, i) => {
      setPixelText(t, `${i === this.cursor ? '> ' : '  '}${this.items[i].label()}`);
      t.setTint(i === this.cursor ? 0xf2d27a : 0xb7c2d6);
    });
  }

  override update(_time: number, delta: number): void {
    const { input, audio } = svc();
    input.update();
    this.t += delta / 16.67;
    this.stageView.update(delta / 16.67);
    // Slow idle drift of the camera for a living menu background (whole pixels only).
    this.cameras.main.setScroll(
      Math.round(REF_CENTER.x - 320 + Math.sin(this.t / 400) * 60),
      REF_CENTER.y - 180 - 40,
    );

    if (this.controls.visible) {
      if (input.wasPressed('back') || input.wasPressed('confirm')) {
        this.controls.setVisible(false);
        audio.play('ui_back', 'ui');
      }
      return;
    }
    const n = this.items.length;
    if (input.wasPressed('up')) {
      this.cursor = (this.cursor + n - 1) % n;
      audio.play('ui_move', 'ui');
    } else if (input.wasPressed('down')) {
      this.cursor = (this.cursor + 1) % n;
      audio.play('ui_move', 'ui');
    } else if (input.wasPressed('left') || input.wasPressed('right')) {
      const item = this.items[this.cursor];
      if (item.adjust) {
        item.adjust(input.wasPressed('left') ? -1 : 1);
        audio.play('ui_move', 'ui');
      }
    } else if (input.wasPressed('confirm')) {
      const item = this.items[this.cursor];
      if (item.confirm) {
        audio.play('ui_confirm', 'ui');
        item.confirm();
      }
    }
    this.refresh();
  }
}
