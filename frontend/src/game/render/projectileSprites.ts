import { PixelBuffer, hashNoise } from './pixelBuffer';
import { PAL } from './palette';
import type { EffectSheet } from './effectSprites';

/**
 * Procedural projectile and elemental effect frames. No runtime rotation (Art Bible §1):
 * directional sprites (arrows) are pre-drawn in 16 directions.
 */

export const ARROW_DIRECTIONS = 16;

const sheet = (frames: PixelBuffer[]): EffectSheet => ({
  frames,
  originX: Math.floor(frames[0].w / 2),
  originY: Math.floor(frames[0].h / 2),
});

/** Arrow pointing along angle i * 22.5° (screen space, 0 = right, clockwise). */
export const arrowFrames = (heavy: boolean): EffectSheet => {
  const size = heavy ? 22 : 16;
  const len = heavy ? 16 : 11;
  const frames: PixelBuffer[] = [];
  for (let i = 0; i < ARROW_DIRECTIONS; i++) {
    const a = (i / ARROW_DIRECTIONS) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const c = size / 2;
    const b = new PixelBuffer(size, size);
    const tail = [c - (dx * len) / 2, c - (dy * len) / 2];
    const tip = [c + (dx * len) / 2, c + (dy * len) / 2];
    b.line(tail[0], tail[1], tip[0], tip[1], heavy ? PAL.wood[2] : PAL.wood[3], heavy ? 2 : 1);
    b.set(tip[0], tip[1], PAL.steel[4]);
    b.set(tip[0] - dx, tip[1] - dy, PAL.steel[3]);
    if (heavy) b.set(tip[0] + dx, tip[1] + dy, PAL.steel[4]);
    // fletching
    const px = -dy;
    const py = dx;
    b.set(tail[0] + px, tail[1] + py, PAL.steel[4]);
    b.set(tail[0] - px, tail[1] - py, PAL.steel[4]);
    b.set(tail[0] + dx + px, tail[1] + dy + py, PAL.steel[3]);
    b.set(tail[0] + dx - px, tail[1] + dy - py, PAL.steel[3]);
    b.outline();
    frames.push(b);
  }
  return sheet(frames);
};

export const arrowFrameFor = (vx: number, vy: number): number => {
  const a = Math.atan2(vy, vx);
  return ((Math.round((a / (Math.PI * 2)) * ARROW_DIRECTIONS) % ARROW_DIRECTIONS) + ARROW_DIRECTIONS) % ARROW_DIRECTIONS;
};

/** Spinning thrown axe, 4 frames (0°, 90°, 180°, 270°). */
export const axeFrames = (): EffectSheet => {
  const frames = [0, 1, 2, 3].map((k) => {
    const b = new PixelBuffer(20, 20);
    const a = (k * Math.PI) / 2 - Math.PI / 4;
    const d = [Math.cos(a), Math.sin(a)];
    const p = [-d[1], d[0]];
    const at = (t: number, o = 0) => [10 + d[0] * t + p[0] * o, 10 + d[1] * t + p[1] * o] as const;
    b.line(...at(-8), ...at(7), PAL.wood[2], 2);
    for (let t = 1; t <= 8; t++) {
      const reach = 5 - Math.abs(t - 4.5) * 0.9;
      for (let o = 1; o <= reach; o += 0.5) b.set(...at(t, o), o > reach - 1 ? PAL.steel[4] : PAL.steel[2]);
    }
    b.set(...at(-9), PAL.gold[2]);
    b.outline();
    return b;
  });
  return sheet(frames);
};

/** Flickering orb (fireball / ball lightning). */
export const orbFrames = (size: number, ramp: readonly number[], spiky = false): EffectSheet => {
  const c = size / 2;
  const frames = [0, 1, 2].map((f) => {
    const b = new PixelBuffer(size, size);
    const r = size / 2 - 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
        const wob = hashNoise(x, y, f + 3) * 1.4;
        if (d > r + wob - 0.6) continue;
        const k = d / r;
        b.set(x, y, k < 0.35 ? ramp[ramp.length - 1] : k < 0.6 ? ramp[3] : k < 0.85 ? ramp[2] : ramp[1]);
      }
    }
    if (spiky) {
      for (let i = 0; i < 3; i++) {
        const a = hashNoise(i, f, 9) * Math.PI * 2;
        for (let t = r; t < r + 3; t++) b.set(c + Math.cos(a) * t, c + Math.sin(a) * t, ramp[3]);
      }
    }
    return b;
  });
  return sheet(frames);
};

/** Pointed crystal (ice shard / lance), horizontal. */
export const crystalFrames = (w: number, h: number): EffectSheet => {
  const I = PAL.ice;
  const b = new PixelBuffer(w, h);
  const cy = (h - 1) / 2;
  for (let x = 0; x < w; x++) {
    const t = x / (w - 1);
    const half = Math.max(0.5, (h / 2) * (t < 0.7 ? t / 0.7 : (1 - t) / 0.3));
    for (let y = 0; y < h; y++) {
      const dy = y - cy;
      if (Math.abs(dy) > half) continue;
      b.set(x, y, dy < -half + 1 ? I[4] : dy < 0 ? I[3] : I[2]);
    }
  }
  b.outline(I[0]);
  return sheet([b]);
};

/** Jagged electric line from (x0,y0) to (x1,y1). */
const bolt = (b: PixelBuffer, x0: number, y0: number, x1: number, y1: number, seed: number, amp: number, core: number, glow: number) => {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 5));
  let px = x0;
  let py = y0;
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  const nl = Math.hypot(nx, ny) || 1;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const off = i === n ? 0 : (hashNoise(i, seed, 13) - 0.5) * 2 * amp;
    const x = x0 + (x1 - x0) * t + (nx / nl) * off;
    const y = y0 + (y1 - y0) * t + (ny / nl) * off;
    b.line(px, py, x, y, glow, 3);
    b.line(px, py, x, y, core, 1);
    px = x;
    py = y;
  }
};

export const sparkBoltFrames = (): EffectSheet => {
  const Z = PAL.lightning;
  return sheet(
    [0, 1].map((f) => {
      const b = new PixelBuffer(16, 9);
      bolt(b, 1, 4, 15, 4, f, 2.5, Z[4], Z[2]);
      return b;
    }),
  );
};

export const beamFrames = (w: number, h: number, vertical: boolean): EffectSheet => {
  const Z = PAL.lightning;
  return sheet(
    [0, 1, 2].map((f) => {
      const b = new PixelBuffer(vertical ? h : w, vertical ? w : h);
      const len = vertical ? w : w;
      const thick = f === 2 ? 1 : 3;
      for (let s = 0; s < (f === 2 ? 1 : 2); s++) {
        if (vertical) bolt(b, h / 2, 0, h / 2, len - 1, f * 7 + s, h / 3, Z[4], f === 0 ? Z[3] : Z[2]);
        else bolt(b, 0, h / 2, len - 1, h / 2, f * 7 + s, h / 3, Z[4], f === 0 ? Z[3] : Z[2]);
      }
      if (thick === 3 && f === 0) {
        // bright core flash
        if (vertical) b.rect(Math.floor(h / 2), 0, 1, len, PAL.white);
        else b.rect(0, Math.floor(h / 2), len, 1, PAL.white);
      }
      return b;
    }),
  );
};

/** Vertical flame pillar rising from the ground (origin = center). */
export const fireColumnFrames = (w: number, h: number): EffectSheet => {
  const F = PAL.fire;
  return sheet(
    [0, 1, 2, 3].map((f) => {
      const b = new PixelBuffer(w, h);
      const height = f === 0 ? h * 0.4 : f === 3 ? h * 0.75 : h;
      for (let y = 0; y < h; y++) {
        const fromBottom = h - 1 - y;
        if (fromBottom > height) continue;
        const t = fromBottom / height;
        const half = (w / 2) * (1 - t * 0.55) * (0.8 + hashNoise(y, f, 5) * 0.3);
        for (let x = 0; x < w; x++) {
          const dx = Math.abs(x + 0.5 - w / 2);
          if (dx > half) continue;
          const k = dx / half;
          b.set(x, y, k < 0.3 ? F[4] : k < 0.6 ? F[3] : k < 0.85 ? F[2] : F[1]);
        }
      }
      return b;
    }),
  );
};

export const iceSpikesFrames = (w: number, h: number): EffectSheet => {
  const I = PAL.ice;
  const spikes = [0.12, 0.3, 0.5, 0.68, 0.86];
  return sheet(
    [0.35, 1, 0.8].map((grow, f) => {
      const b = new PixelBuffer(w, h);
      spikes.forEach((sx, i) => {
        const sh = h * grow * (0.6 + hashNoise(i, 0, 21) * 0.4);
        const base = 3 + (i % 2);
        const cx = sx * w;
        for (let y = 0; y < sh; y++) {
          const half = base * (1 - y / sh);
          for (let x = Math.floor(cx - half); x <= cx + half; x++) {
            b.set(x, h - 1 - y, x < cx ? I[3] : I[2]);
          }
        }
        b.set(cx, h - sh, I[4]);
      });
      if (f === 2) for (let x = 0; x < w; x += 3) b.set(x, h - 1 - (x % 5), I[4]);
      b.outline(I[0]);
      return b;
    }),
  );
};

/** Big fire explosion (fireballs). */
export const explosionFrames = (size: number): EffectSheet => {
  const F = PAL.fire;
  const c = size / 2;
  return sheet(
    [0.35, 0.7, 1, 0.9, 0.7].map((k, f) => {
      const b = new PixelBuffer(size, size);
      const r = (size / 2 - 1) * k;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) + hashNoise(x, y, f) * 2.5;
          if (d > r) continue;
          const t = d / r;
          if (f >= 3 && t < 0.45 + (f - 3) * 0.2) continue; // hollowing smoke ring
          const col = f >= 3 ? (t > 0.85 ? PAL.stone[2] : F[1]) : t < 0.3 ? F[4] : t < 0.6 ? F[3] : t < 0.85 ? F[2] : F[1];
          b.set(x, y, col);
        }
      }
      return b;
    }),
  );
};

/** Tintable white shock ring for bursts (frost / fire burst / electric arc). */
export const burstRingFrames = (size: number): EffectSheet => {
  const c = size / 2;
  return sheet(
    [0.3, 0.55, 0.8, 1].map((k, f) => {
      const b = new PixelBuffer(size, size);
      b.ring(c, c, (size / 2 - 1) * k, f < 2 ? 3 : f === 2 ? 2 : 1, PAL.white);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + f * 0.2;
        const d = (size / 2 - 1) * k * 0.7;
        b.set(c + Math.cos(a) * d, c + Math.sin(a) * d, PAL.white);
      }
      return b;
    }),
  );
};

/** Small electric spark (hit effect). */
export const shockFrames = (): EffectSheet => {
  const Z = PAL.lightning;
  return sheet(
    [0, 1, 2, 3].map((f) => {
      const b = new PixelBuffer(26, 26);
      const n = f < 2 ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const a = hashNoise(i, f, 4) * Math.PI * 2;
        const l = 6 + f * 2;
        bolt(b, 13, 13, 13 + Math.cos(a) * l, 13 + Math.sin(a) * l, i + f * 5, 1.5, Z[4], Z[2]);
      }
      if (f < 2) b.disc(13, 13, 2 - f, PAL.white);
      return b;
    }),
  );
};

/** Frost hit: shards flying out. */
export const frostFrames = (): EffectSheet => {
  const I = PAL.ice;
  return sheet(
    [0, 1, 2, 3].map((f) => {
      const b = new PixelBuffer(26, 26);
      if (f === 0) b.disc(13, 13, 4, I[4]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const d = 4 + f * 3;
        const x = 13 + Math.cos(a) * d;
        const y = 13 + Math.sin(a) * d;
        b.set(x, y, I[4]);
        b.set(x + Math.cos(a), y + Math.sin(a), I[3]);
        if (f < 2) b.set(x - Math.cos(a), y - Math.sin(a), I[2]);
      }
      return b;
    }),
  );
};
