import Phaser from 'phaser';
import { EFFECT_ORIGINS } from '../render/textures';

interface ActiveFx {
  sprite: Phaser.GameObjects.Sprite;
  key: string;
  frame: number;
  frames: number;
  frameTicks: number;
  age: number;
  follow?: () => { x: number; y: number; flip: boolean } | null;
  dx: number;
  dy: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  life: number;
  max: number;
  color: number;
  size: number;
}

interface Afterimage {
  img: Phaser.GameObjects.Image;
  life: number;
  max: number;
}

export interface SpawnOptions {
  flip?: boolean;
  frameTicks?: number;
  depth?: number;
  alpha?: number;
  /** Re-anchors the effect to a moving point every frame (slashes follow the sword). */
  follow?: () => { x: number; y: number; flip: boolean } | null;
  dx?: number;
  dy?: number;
  /** Multiplies the (mostly white) effect art: elemental variants of the same sprite. */
  tint?: number;
}

export const MAX_PARTICLES = 150;

/**
 * Pooled, budgeted visual effects. Everything here is cosmetic; it never feeds back into the
 * simulation. Effects advance in 60 Hz "ticks" so they keep animating during hitstop.
 */
export class EffectManager {
  private readonly pool: Phaser.GameObjects.Sprite[] = [];
  private readonly active: ActiveFx[] = [];
  private readonly particles: Particle[] = [];
  private readonly afterimages: Afterimage[] = [];
  private readonly imgPool: Phaser.GameObjects.Image[] = [];
  private readonly gfx: Phaser.GameObjects.Graphics;
  private shakeMag = 0;
  private shakeTicks = 0;
  private shakeMax = 1;
  shakeX = 0;
  shakeY = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(30);
  }

  spawn(key: string, x: number, y: number, opts: SpawnOptions = {}): void {
    const meta = EFFECT_ORIGINS.get(key);
    if (!meta) return;
    const sprite = this.pool.pop() ?? this.scene.add.sprite(0, 0, key);
    sprite.setTexture(key, 0);
    sprite.setActive(true).setVisible(true);
    sprite.setDepth(opts.depth ?? 25).setAlpha(opts.alpha ?? 1);
    if (opts.tint !== undefined) sprite.setTint(opts.tint);
    else sprite.clearTint();
    const fx: ActiveFx = {
      sprite,
      key,
      frame: 0,
      frames: meta.frames,
      frameTicks: opts.frameTicks ?? 3,
      age: 0,
      follow: opts.follow,
      dx: opts.dx ?? 0,
      dy: opts.dy ?? 0,
    };
    this.place(fx, x, y, opts.flip ?? false);
    this.active.push(fx);
  }

  private place(fx: ActiveFx, x: number, y: number, flip: boolean) {
    const meta = EFFECT_ORIGINS.get(fx.key)!;
    const w = fx.sprite.frame.width;
    const h = fx.sprite.frame.height;
    fx.sprite.setFlipX(flip);
    fx.sprite.setOrigin((flip ? w - meta.x : meta.x) / w, meta.y / h);
    fx.sprite.setPosition(Math.round(x + (flip ? -fx.dx : fx.dx)), Math.round(y + fx.dy));
  }

  burst(
    x: number,
    y: number,
    count: number,
    colors: readonly number[],
    opts: { speed?: number; gravity?: number; life?: number; size?: number; angle?: number; spread?: number; drag?: number } = {},
  ): void {
    const speed = opts.speed ?? 2;
    const spread = opts.spread ?? Math.PI * 2;
    const base = opts.angle ?? 0;
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const a = base + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      const life = (opts.life ?? 20) * (0.6 + Math.random() * 0.6);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        gravity: opts.gravity ?? 0.12,
        drag: opts.drag ?? 0.94,
        life,
        max: life,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: opts.size ?? 1,
      });
    }
  }

  /** Fading copy of a fighter frame (knockback trail). */
  afterimage(src: Phaser.GameObjects.Image, color: number, life = 12): void {
    if (this.afterimages.length > 24) return;
    const img = this.imgPool.pop() ?? this.scene.add.image(0, 0, src.texture.key);
    img.setTexture(src.texture.key, src.frame.name);
    img.setOrigin(src.originX, src.originY).setPosition(src.x, src.y).setFlipX(src.flipX);
    img.setTintFill(color).setAlpha(0.6).setDepth(src.depth - 1).setVisible(true).setActive(true);
    this.afterimages.push({ img, life, max: life });
  }

  shake(magnitude: number, ticks: number): void {
    if (magnitude >= this.shakeMag * (this.shakeTicks / this.shakeMax)) {
      this.shakeMag = Math.min(6, magnitude);
      this.shakeTicks = ticks;
      this.shakeMax = ticks;
    }
  }

  /** `dt` in 60 Hz ticks (1 at 60 fps). */
  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.age += dt;
      const frame = Math.floor(fx.age / fx.frameTicks);
      if (frame >= fx.frames) {
        fx.sprite.setVisible(false).setActive(false);
        this.pool.push(fx.sprite);
        this.active.splice(i, 1);
        continue;
      }
      if (frame !== fx.frame) {
        fx.frame = frame;
        fx.sprite.setFrame(frame);
      }
      if (fx.follow) {
        const p = fx.follow();
        if (p) this.place(fx, p.x, p.y, p.flip);
      }
    }

    this.gfx.clear();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vx *= Math.pow(p.drag, dt);
      p.vy = p.vy * Math.pow(p.drag, dt) + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Alpha in three steps only (Art Bible §8).
      const k = p.life / p.max;
      this.gfx.fillStyle(p.color, k > 0.66 ? 1 : k > 0.33 ? 0.66 : 0.33);
      this.gfx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }

    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const a = this.afterimages[i];
      a.life -= dt;
      if (a.life <= 0) {
        a.img.setVisible(false).setActive(false);
        this.imgPool.push(a.img);
        this.afterimages.splice(i, 1);
        continue;
      }
      const k = a.life / a.max;
      a.img.setAlpha(k > 0.66 ? 0.6 : k > 0.33 ? 0.4 : 0.2);
    }

    if (this.shakeTicks > 0) {
      this.shakeTicks -= dt;
      const m = this.shakeMag * Math.max(0, this.shakeTicks / this.shakeMax);
      this.shakeX = Math.round((Math.random() * 2 - 1) * m);
      this.shakeY = Math.round((Math.random() * 2 - 1) * m);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeMag = 0;
    }
  }

  get particleCount(): number {
    return this.particles.length;
  }
}
