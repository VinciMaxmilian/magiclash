import Phaser from 'phaser';
import { TICK_RATE, type FighterState, type MatchState } from '@magiclash/shared';
import { damageColor, type TeamColor } from '../game/render/palette';
import { ensurePanel } from '../game/render/textures';
import { pixelText, setPixelText } from './text';

const DEPTH = 1000;
const PANEL_W = 126;
const PANEL_H = 34;

interface FighterHud {
  root: Phaser.GameObjects.Container;
  damage: Phaser.GameObjects.BitmapText;
  stocks: Phaser.GameObjects.Image[];
  lastDamage: number;
  shake: number;
  baseX: number;
}

/**
 * Fixed-to-screen HUD. Reads simulation state only; the numbers shown are exactly what the
 * sim computed (nothing is tracked separately on the client).
 */
export class Hud {
  private readonly fighters: FighterHud[] = [];
  private readonly timer: Phaser.GameObjects.BitmapText;
  private readonly banner: Phaser.GameObjects.BitmapText;
  private bannerTicks = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    fighters: FighterState[],
    teams: TeamColor[],
    labels: string[],
  ) {
    const n = fighters.length;
    const gap = 12;
    const total = n * PANEL_W + (n - 1) * gap;
    const panelKey = ensurePanel(scene, PANEL_W, PANEL_H);
    fighters.forEach((f, i) => {
      const x = Math.round(320 - total / 2 + i * (PANEL_W + gap));
      const y = 360 - PANEL_H - 6;
      const root = scene.add.container(x, y).setScrollFactor(0).setDepth(DEPTH);
      root.add(scene.add.image(0, 0, panelKey).setOrigin(0, 0));
      root.add(scene.add.image(4, 4, ensurePanel(scene, 24, 24, 0xd9a24e)).setOrigin(0, 0));
      root.add(scene.add.image(7, 7, `portrait_${teams[i]}`).setOrigin(0, 0));
      root.add(pixelText(scene, 32, 4, labels[i], { outline: false, color: 0xb7c2d6, fixed: false }));
      const damage = pixelText(scene, PANEL_W - 6, 12, '0%', { scale: 2, fixed: false, align: 'right' });
      root.add(damage);
      const stocks: Phaser.GameObjects.Image[] = [];
      for (let s = 0; s < f.stocks; s++) {
        const icon = scene.add.image(32 + s * 9, 17, `stock_${teams[i]}`).setOrigin(0, 0);
        stocks.push(icon);
        root.add(icon);
      }
      root.setScrollFactor(0, 0, true);
      this.fighters.push({ root, damage, stocks, lastDamage: 0, shake: 0, baseX: PANEL_W - 6 });
    });

    this.timer = pixelText(scene, 320, 6, '', { align: 'center', depth: DEPTH });
    this.banner = pixelText(scene, 320, 140, '', { align: 'center', scale: 4, depth: DEPTH + 1 });
    this.banner.setVisible(false);
  }

  /** Big centered message (countdown, KO!, GAME!). */
  showBanner(text: string, color: number, ticks = 50): void {
    setPixelText(this.banner, text);
    this.banner.setTint(color).setVisible(true);
    this.bannerTicks = ticks;
  }

  update(fighters: FighterState[], match: MatchState, dt: number): void {
    fighters.forEach((f, i) => {
      const h = this.fighters[i];
      const dmg = Math.floor(f.damage);
      if (dmg !== h.lastDamage) {
        if (dmg > h.lastDamage) h.shake = 10;
        h.lastDamage = dmg;
        setPixelText(h.damage, `${dmg}%`);
      }
      h.damage.setTint(damageColor(dmg));
      h.shake = Math.max(0, h.shake - dt);
      h.damage.x = h.baseX + (h.shake > 0 ? Math.round((Math.random() * 2 - 1) * Math.min(2, h.shake / 3)) : 0);
      h.damage.y = 12 + (h.shake > 0 ? Math.round((Math.random() * 2 - 1) * Math.min(2, h.shake / 3)) : 0);
      h.stocks.forEach((s, k) => s.setAlpha(k < f.stocks ? 1 : 0.2));
      h.root.setAlpha(f.stocks > 0 ? 1 : 0.5);
    });

    if (match.timeLeft >= 0) {
      const secs = Math.ceil(match.timeLeft / TICK_RATE);
      setPixelText(this.timer, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
      this.timer.setTint(secs <= 10 ? 0xcf3f3a : 0xeef2f7);
    }

    if (this.bannerTicks > 0) {
      this.bannerTicks -= dt;
      if (this.bannerTicks <= 0) this.banner.setVisible(false);
    }
  }
}
