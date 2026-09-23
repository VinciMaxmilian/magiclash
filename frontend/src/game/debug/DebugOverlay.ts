import Phaser from 'phaser';
import { bodyRect, worldHitboxes, worldHurtboxes, type Simulation, type BotController } from '@magiclash/shared';
import { pixelText, setPixelText } from '../../ui/text';

/**
 * DEV-ONLY overlay (F1). Imported dynamically behind `__DEV_TOOLS__`, so it is not
 * part of production bundles. F2 toggles slow motion in the match scene.
 *
 * Colors: green = hurtbox, red = active hitbox, blue = environment body, yellow = stage
 * collision, magenta = blast zone.
 */
export class DebugOverlay {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.BitmapText;
  private visible = false;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(500);
    this.text = pixelText(scene, 4, 16, '', { outline: true, depth: 1500 });
    this.setVisible(false);
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  private setVisible(v: boolean) {
    this.visible = v;
    this.gfx.setVisible(v);
    this.text.setVisible(v);
  }

  update(sim: Simulation, fps: number, bots: BotController[], slowmo: boolean): void {
    if (!this.visible) return;
    const g = this.gfx;
    g.clear();

    const st = sim.stage;
    g.lineStyle(1, 0xe8b830, 0.9);
    for (const s of st.solids) g.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
    for (const p of st.platforms) g.lineBetween(p.x, p.y + 0.5, p.x + p.w, p.y + 0.5);
    g.lineStyle(1, 0xff4fd8, 0.9);
    const bz = st.blastZone;
    g.strokeRect(bz.left, bz.top, bz.right - bz.left, bz.bottom - bz.top);

    const lines: string[] = [`FPS ${fps.toFixed(0)}  TICK ${sim.state.tick}  PING --  ${slowmo ? 'SLOW x0.25' : ''}`];
    for (const f of sim.state.fighters) {
      const c = sim.characterOf(f);
      if (f.state !== 'dead') {
        const b = bodyRect(f.x, f.y, c.body.w, c.body.h);
        g.lineStyle(1, 0x4f86e0, 0.9);
        g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
        g.fillStyle(0x56a33f, 0.35);
        g.lineStyle(1, 0x56a33f, 1);
        for (const h of worldHurtboxes(f, c)) {
          g.fillRect(h.x, h.y, h.w, h.h);
          g.strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1);
        }
        const atk = sim.attackOf(f);
        if (atk) {
          g.fillStyle(0xcf3f3a, 0.45);
          g.lineStyle(1, 0xcf3f3a, 1);
          for (const h of worldHitboxes(f, atk)) {
            g.fillRect(h.x, h.y, h.w, h.h);
            g.strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1);
          }
        }
        g.fillStyle(0xffffff, 1);
        g.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
      }
      const bot = bots.find((b) => b.index === f.index);
      const atk = f.attack ? `${f.attack.id}:${f.attack.frame}` : '-';
      lines.push(
        `P${f.index + 1} ${f.state.toUpperCase()} X${f.x.toFixed(0)} Y${f.y.toFixed(0)} VX${f.vx.toFixed(1)} VY${f.vy.toFixed(1)}`,
        `   ${f.damage}% ATK ${atk} STUN ${f.hitstun} LAG ${f.hitlag} J${f.airJumps}${bot ? ` BOT ${bot.mode.toUpperCase()}` : ''}`,
      );
    }
    setPixelText(this.text, lines.join('\n'));
  }
}
