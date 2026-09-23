import Phaser from 'phaser';
import type { ProjectileState, Simulation } from '@magiclash/shared';
import { EFFECT_ORIGINS } from './textures';
import { arrowFrameFor } from './projectileSprites';

/** Sprites for live projectiles, synced by uid every render frame. Purely cosmetic. */
export class ProjectileViews {
  private readonly sprites = new Map<number, Phaser.GameObjects.Sprite>();
  private readonly pool: Phaser.GameObjects.Sprite[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  update(sim: Simulation, t: number): void {
    const alive = new Set<number>();
    for (const p of sim.state.projectiles) {
      alive.add(p.uid);
      const def = sim.projectileDef(p);
      const exploding = p.exploding > 0 && def.explosion;
      const key = exploding ? (def.explosion!.w > 44 ? 'fx_explosion_big' : 'fx_explosion') : `proj_${def.sprite}`;
      const meta = EFFECT_ORIGINS.get(key);
      if (!meta) continue;
      let s = this.sprites.get(p.uid);
      if (!s) {
        s = this.pool.pop() ?? this.scene.add.sprite(0, 0, key);
        s.setActive(true).setVisible(true).setDepth(20);
        this.sprites.set(p.uid, s);
      }
      if (s.texture.key !== key) s.setTexture(key, 0);
      s.setFrame(this.frameFor(p, def.sprite, meta.frames, exploding ? def.explosion!.ticks : def.lifetime, t));
      const flip = !def.sprite.startsWith('arrow') && def.sprite !== 'axe' && p.facing < 0;
      s.setFlipX(flip);
      s.setOrigin(meta.x / s.frame.width, meta.y / s.frame.height);
      s.setPosition(Math.round(p.x), Math.round(p.y));
      s.setAlpha(p.stuck >= 0 && def.stuckLifetime && p.stuck > def.stuckLifetime - 40 && t % 6 < 3 ? 0.4 : 1);
    }
    for (const [uid, s] of this.sprites) {
      if (alive.has(uid)) continue;
      s.setVisible(false).setActive(false);
      this.pool.push(s);
      this.sprites.delete(uid);
    }
  }

  private frameFor(p: ProjectileState, sprite: string, frames: number, lifetime: number, t: number): number {
    if (p.exploding > 0) return Math.min(frames - 1, Math.floor((1 - p.exploding / lifetime) * frames));
    if (sprite.startsWith('arrow')) return p.stuck >= 0 ? arrowFrameFor(p.facing, 0.35) : arrowFrameFor(p.vx, p.vy);
    if (sprite === 'axe') return p.stuck >= 0 ? 1 : Math.floor(p.age / 3) % 4;
    // Grounded / attached hazards play once over their lifetime.
    if (['fire_column', 'ice_spikes', 'thunder_beam', 'sky_spark', 'thunderstrike'].includes(sprite)) {
      return Math.min(frames - 1, Math.floor((p.age / lifetime) * frames));
    }
    return Math.floor(t / 4) % frames;
  }

  clear(): void {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
  }
}
