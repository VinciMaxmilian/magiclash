import { PixelBuffer } from './pixelBuffer';
import { PAL } from './palette';

/**
 * Procedural effect frames. Rules (docs/ASSETS.md §8): short, palette-only, crisp,
 * never covering a fighter for longer than the hitstop.
 */

export interface EffectSheet {
  frames: PixelBuffer[];
  /** Pixel inside the frame that sits on the effect's world position. */
  originX: number;
  originY: number;
}

// ── Slash arcs ────────────────────────────────────────────────────────────────

export interface SlashDef {
  r: number;
  a0: number;
  a1: number;
  thick: number;
  /** Arc center relative to the fighter's feet (facing right). */
  ox: number;
  oy: number;
}

export const SLASHES: Record<string, SlashDef> = {
  slash_small: { r: 18, a0: -70, a1: 30, thick: 5, ox: 6, oy: -22 },
  slash_wide: { r: 24, a0: -100, a1: 20, thick: 6, ox: 4, oy: -22 },
  slash_up: { r: 22, a0: 50, a1: -140, thick: 6, ox: 2, oy: -28 },
  slash_low: { r: 22, a0: -25, a1: 35, thick: 5, ox: 2, oy: -10 },
  slash_heavy: { r: 28, a0: -160, a1: 50, thick: 8, ox: 4, oy: -22 },
  slash_arc: { r: 22, a0: -120, a1: 90, thick: 6, ox: 2, oy: -24 },
};

const arcT = (ang: number, a0: number, a1: number): number => {
  const sweep = a1 - a0;
  const d = sweep >= 0 ? (((ang - a0) % 360) + 360) % 360 : -((((a0 - ang) % 360) + 360) % 360);
  return d / sweep;
};

export const slashFrames = (def: SlashDef): EffectSheet => {
  const size = Math.ceil((def.r + 2) * 2) + 2;
  const c = size / 2;
  const S = PAL.steel;
  const stages = [
    { tMin: 0, th: 1, outer: PAL.white, inner: S[3] },
    { tMin: 0.3, th: 0.7, outer: S[4], inner: S[3] },
    { tMin: 0.6, th: 0.45, outer: S[3], inner: S[2] },
    { tMin: 0.85, th: 0.3, outer: S[2], inner: S[2] },
  ];
  const frames = stages.map((st) => {
    const b = new PixelBuffer(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const dist = Math.hypot(dx, dy);
        const t = arcT((Math.atan2(dy, dx) * 180) / Math.PI, def.a0, def.a1);
        if (t < st.tMin || t > 1) continue;
        const th = Math.max(1, def.thick * st.th * Math.sin(Math.min(1, t) * Math.PI * 0.95 + 0.05));
        if (dist > def.r || dist < def.r - th) continue;
        b.set(x, y, dist > def.r - 1.2 ? st.outer : st.inner);
      }
    }
    return b;
  });
  return { frames, originX: Math.floor(c), originY: Math.floor(c) };
};

/** Straight streaks for thrusts (horizontal) or plunges (vertical). */
export const streakFrames = (vertical: boolean, length: number): EffectSheet => {
  const S = PAL.steel;
  const w = vertical ? 12 : length;
  const h = vertical ? length : 12;
  const frames = [1, 0.7, 0.4].map((k) => {
    const b = new PixelBuffer(w, h);
    const lines = [
      { off: 3, len: 0.6 * k, col: S[3] },
      { off: 6, len: k, col: PAL.white },
      { off: 9, len: 0.75 * k, col: S[3] },
    ];
    for (const l of lines) {
      const n = Math.round(length * l.len);
      for (let i = 0; i < n; i++) {
        const p = length - 1 - i; // streak grows back from the tip
        if (vertical) b.set(l.off, p, l.col);
        else b.set(p, l.off, l.col);
      }
    }
    return b;
  });
  return { frames, originX: vertical ? 6 : 0, originY: vertical ? 0 : 6 };
};

// ── Hit sparks ────────────────────────────────────────────────────────────────

export const sparkFrames = (big: boolean): EffectSheet => {
  const size = big ? 40 : 26;
  const c = size / 2;
  const F = PAL.fire;
  const rayLen = big ? [7, 13, 17, 18, 0] : [5, 9, 11, 12, 0];
  const core = big ? [5, 4, 2, 0, 0] : [3, 3, 1, 0, 0];
  const frames = rayLen.map((len, f) => {
    const b = new PixelBuffer(size, size);
    if (core[f] > 0) {
      b.disc(c, c, core[f] + 1, F[3]);
      b.disc(c, c, core[f], PAL.white);
    }
    const rays = 8;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + (i % 2 ? 0.2 : 0);
      const l = i % 2 ? len * 0.6 : len;
      const start = f >= 2 ? l * 0.55 : core[f];
      for (let d = start; d <= l; d++) {
        const col = d > l * 0.75 ? F[2] : d > l * 0.45 ? F[3] : F[4];
        b.set(c + Math.cos(a) * d, c + Math.sin(a) * d, col);
      }
    }
    if (f === 4) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        b.set(c + Math.cos(a) * (len || rayLen[3]) * 1.05, c + Math.sin(a) * rayLen[3] * 1.05, F[2]);
      }
    }
    return b;
  });
  return { frames, originX: Math.floor(c), originY: Math.floor(c) };
};

// ── Dust ──────────────────────────────────────────────────────────────────────

export const dustFrames = (): EffectSheet => {
  const w = 28;
  const h = 14;
  const S = PAL.stone;
  const puffs = [
    { x: 8, y: 9, r: 3 },
    { x: 14, y: 8, r: 4 },
    { x: 20, y: 9, r: 3 },
  ];
  const frames = [0, 1, 2, 3, 4, 5].map((f) => {
    const b = new PixelBuffer(w, h);
    for (const p of puffs) {
      const spread = (p.x - 14) * f * 0.35;
      const r = Math.max(0, p.r + (f < 2 ? f : 2 - (f - 2) * 0.8));
      if (r <= 0.3) continue;
      b.disc(p.x + spread, p.y - f * 0.6, r, f < 3 ? S[3] : S[2]);
      b.disc(p.x + spread - 1, p.y - f * 0.6 - 1, Math.max(0, r - 1.5), S[4]);
    }
    return b;
  });
  return { frames, originX: 14, originY: 12 };
};

/** Small ring shown under an air jump. */
export const ringFrames = (): EffectSheet => {
  const frames = [3, 5, 7, 8].map((r, f) => {
    const b = new PixelBuffer(20, 8);
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const x = 10 + Math.cos(a) * r;
      const y = 4 + Math.sin(a) * r * 0.35;
      if (f === 3 && Math.sin(a * 3) > 0) continue;
      b.set(x, y, f < 2 ? PAL.steel[4] : PAL.steel[3]);
    }
    return b;
  });
  return { frames, originX: 10, originY: 4 };
};

// ── Torch flame (stage ambience) ─────────────────────────────────────────────

export const flameFrames = (): EffectSheet => {
  const F = PAL.fire;
  const shapes = [
    ['..3..', '.343.', '.343.', '23432', '23432', '.222.', '..1..'],
    ['...3.', '..34.', '.343.', '.3432', '23432', '.222.', '..1..'],
    ['.3...', '.43..', '.343.', '2343.', '23432', '.222.', '..1..'],
  ];
  const frames = shapes.map((s) => {
    const b = new PixelBuffer(5, 7);
    b.stamp(0, 0, s, { '1': F[1], '2': F[2], '3': F[3], '4': F[4] });
    return b;
  });
  return { frames, originX: 2, originY: 6 };
};
