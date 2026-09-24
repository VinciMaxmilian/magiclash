import { PixelBuffer, hashNoise } from './pixelBuffer';
import { PAL, TEAM_RAMPS } from './palette';
import type { EffectSheet } from './effectSprites';

/**
 * Temporada 1 procedural art (the whip rope is live: render/WhipView): crimson mist, daggers, azure magic, hellfire and
 * the summoned animals. Same rules as the rest (docs/ASSETS.md): palette only, crisp, no
 * runtime rotation (directional things are pre-drawn).
 */

type Ramp = readonly number[];
type P = [number, number];

export const BLOOD: Ramp = [...TEAM_RAMPS.red, PAL.sky[6]];
export const DARK: Ramp = [PAL.sky[0], PAL.sky[1], PAL.sky[2], PAL.sky[3], PAL.sky[4]];
export const HELL: Ramp = [PAL.sky[1], PAL.fire[1], PAL.fire[2], PAL.fire[3], PAL.fire[4]];

const centered = (frames: PixelBuffer[]): EffectSheet => ({
  frames,
  originX: Math.floor(frames[0].w / 2),
  originY: Math.floor(frames[0].h / 2),
});

// ── Crimson mist (teleport) ──────────────────────────────────────────────────

/** Red smoke puff with bat-like wisps; origin at the fighter's feet. */
export const mistFrames = (): EffectSheet => {
  const w = 44;
  const h = 52;
  const cx = 22;
  const base = 46;
  const blobs = Array.from({ length: 9 }, (_, i) => ({
    x: (hashNoise(i, 1, 31) - 0.5) * 18,
    y: -6 - hashNoise(i, 2, 31) * 30,
    r: 4 + hashNoise(i, 3, 31) * 4,
    vx: (hashNoise(i, 4, 31) - 0.5) * 3,
    vy: -0.6 - hashNoise(i, 5, 31) * 1.4,
  }));
  const frames = [0, 1, 2, 3, 4, 5].map((f) => {
    const b = new PixelBuffer(w, h);
    for (const bl of blobs) {
      const r = bl.r * (f < 2 ? 0.6 + f * 0.3 : 1.2 - (f - 2) * 0.28);
      if (r <= 0.5) continue;
      const x = cx + bl.x + bl.vx * f;
      const y = base + bl.y + bl.vy * f * 2;
      b.disc(x, y, r, f < 3 ? BLOOD[1] : BLOOD[0]);
      b.disc(x - 1, y - 1, Math.max(0, r - 2), f < 2 ? BLOOD[3] : BLOOD[2]);
      if (f >= 3) {
        // hollowing: the puff thins out from the middle
        const hr = r - 2.5;
        for (let yy = -hr; yy <= hr; yy++) for (let xx = -hr; xx <= hr; xx++) if (xx * xx + yy * yy <= hr * hr) b.clear(Math.round(x + 1 + xx), Math.round(y + 1 + yy));
      }
    }
    // Wisps flying off as tiny bats.
    if (f >= 2) {
      for (let i = 0; i < 3; i++) {
        const x = Math.round(cx + (i - 1) * (8 + f * 2));
        const y = Math.round(base - 30 - f * 3 - i * 3);
        b.set(x, y, PAL.ink);
        b.set(x - 1, y - (f % 2), PAL.ink);
        b.set(x + 1, y - (f % 2), PAL.ink);
        b.set(x - 2, y - 1 + (f % 2), BLOOD[0]);
        b.set(x + 2, y - 1 + (f % 2), BLOOD[0]);
      }
    }
    return b;
  });
  return { frames, originX: cx, originY: base };
};

/** Small bat, 2-frame flap (trails of the vampire's ascent). */
export const batFrames = (): EffectSheet => {
  const maps = [
    ['k.....k', 'kk.k.kk', '.kkkkk.', '..kek..', '...k...'],
    ['.......', '...k...', 'kkkkkkk', 'k.kek.k', '...k...'],
  ];
  return centered(
    maps.map((m) => {
      const b = new PixelBuffer(9, 7);
      b.stamp(1, 1, m, { k: PAL.sky[0], e: PAL.fire[3] });
      return b;
    }),
  );
};

/** Drifting feather (summoner hits / trails). */
export const featherFrames = (): EffectSheet =>
  centered(
    [0, 1, 2, 3].map((f) => {
      const b = new PixelBuffer(20, 20);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.6;
        const d = 3 + f * 2.5;
        const x = 10 + Math.cos(a) * d;
        const y = 10 + Math.sin(a) * d + f;
        b.line(x - 1, y + 1, x + 1, y - 1, i % 2 ? PAL.white : PAL.steel[3], 1);
      }
      if (f === 0) b.disc(10, 10, 2, PAL.white);
      return b;
    }),
  );

/** Blood-red splash hit. */
export const bloodHitFrames = (): EffectSheet =>
  centered(
    [0, 1, 2, 3].map((f) => {
      const b = new PixelBuffer(28, 28);
      if (f < 2) b.disc(14, 14, 3 - f, BLOOD[3]);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + hashNoise(i, 0, 17);
        const d = 3 + f * 3;
        const x = 14 + Math.cos(a) * d;
        const y = 14 + Math.sin(a) * d + f * f * 0.3;
        b.set(x, y, f < 2 ? BLOOD[2] : BLOOD[1]);
        if (f < 3) b.set(x - Math.cos(a), y - Math.sin(a), BLOOD[3]);
      }
      return b;
    }),
  );

// ── Projectiles ──────────────────────────────────────────────────────────────

export const DAGGER_DIRECTIONS = 16;

/** Throwing dagger in 16 directions (same convention as arrows). */
export const daggerFrames = (): EffectSheet => {
  const frames: PixelBuffer[] = [];
  for (let i = 0; i < DAGGER_DIRECTIONS; i++) {
    const a = (i / DAGGER_DIRECTIONS) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const b = new PixelBuffer(16, 16);
    const c = 8;
    const px = -dy;
    const py = dx;
    b.line(c - dx * 5, c - dy * 5, c - dx * 2, c - dy * 2, PAL.leather[1], 1); // grip
    b.line(c - dx * 2 + px * 2, c - dy * 2 + py * 2, c - dx * 2 - px * 2, c - dy * 2 - py * 2, PAL.gold[2], 1); // guard
    b.line(c - dx, c - dy, c + dx * 5, c + dy * 5, PAL.steel[3], 1); // blade
    b.set(c + dx * 6, c + dy * 6, PAL.white);
    b.outline();
    frames.push(b);
  }
  return centered(frames);
};

/** Spinning rune disc (boomerang), 4 frames. */
export const runeDiscFrames = (): EffectSheet => {
  const I = PAL.ice;
  return centered(
    [0, 1, 2, 3].map((f) => {
      const b = new PixelBuffer(18, 18);
      b.disc(9, 9, 7, I[1]);
      b.disc(9, 9, 6, I[2]);
      b.ring(9, 9, 6, 1, I[3]);
      // rotating three-pointed rune
      for (let k = 0; k < 3; k++) {
        const a = f * (Math.PI / 6) + (k * Math.PI * 2) / 3;
        b.line(9, 9, 9 + Math.cos(a) * 5, 9 + Math.sin(a) * 5, I[4], 1);
      }
      b.disc(9, 9, 1.5, PAL.white);
      b.outline(I[0]);
      return b;
    }),
  );
};

/** Crescent sword wave (dhampir), facing right. */
export const crescentFrames = (w: number, h: number): EffectSheet =>
  centered(
    [0, 1].map((f) => {
      const b = new PixelBuffer(w, h);
      const cx = w * 0.15;
      const cy = h / 2;
      const r = h / 2 - 1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = Math.hypot((x - cx) * (h / w) * 1.6, y + 0.5 - cy);
          const inner = Math.hypot((x - cx + 5) * (h / w) * 1.6, y + 0.5 - cy);
          if (d > r || inner < r - 1 || x < cx) continue;
          const t = (d - (r - 4)) / 4;
          b.set(x, y, t > 0.7 ? (f ? BLOOD[3] : PAL.white) : t > 0.3 ? BLOOD[2] : BLOOD[1]);
        }
      }
      return b;
    }),
  );

/** Tall pillar rising from the ground (origin = center), in any ramp (azure / hellfire). */
export const pillarFrames = (w: number, h: number, ramp: Ramp): EffectSheet =>
  centered(
    [0, 1, 2, 3].map((f) => {
      const b = new PixelBuffer(w, h);
      const height = f === 0 ? h * 0.4 : f === 3 ? h * 0.75 : h;
      for (let y = 0; y < h; y++) {
        const fromBottom = h - 1 - y;
        if (fromBottom > height) continue;
        const t = fromBottom / height;
        const half = (w / 2) * (1 - t * 0.5) * (0.8 + hashNoise(y, f, 7) * 0.3);
        for (let x = 0; x < w; x++) {
          const dx = Math.abs(x + 0.5 - w / 2);
          if (dx > half) continue;
          const k = dx / half;
          b.set(x, y, k < 0.3 ? ramp[4] : k < 0.6 ? ramp[3] : k < 0.85 ? ramp[2] : ramp[1]);
        }
      }
      // rising sparks at the top
      for (let i = 0; i < 4; i++) {
        const x = w / 2 + (hashNoise(i, f, 8) - 0.5) * w * 0.8;
        const y = h - height - 2 - hashNoise(i, f, 9) * 6;
        if (y > 0) b.set(x, y, ramp[4]);
      }
      return b;
    }),
  );

// ── Summoned animals (facing right) ────────────────────────────────────────────

const stampFrames = (maps: string[][], colors: Record<string, number>, w: number, h: number, outline: number = PAL.ink): EffectSheet =>
  centered(
    maps.map((m) => {
      const b = new PixelBuffer(w, h);
      b.stamp(1, 1, m, colors);
      b.outline(outline);
      return b;
    }),
  );

export const doveFrames = (): EffectSheet =>
  stampFrames(
    [
      ['...ww.....', '...www....', 'gwwwwwwk..', '.wwwwwwwo.', '..wwww....', '.......'],
      ['..........', '..........', 'gwwwwwwk..', '.wwwwwwwo.', '..wwwww...', '...ww.....'],
    ],
    { w: PAL.white, g: PAL.steel[3], k: PAL.ink, o: PAL.fire[3] },
    12,
    9,
  );

export const catFrames = (): EffectSheet =>
  stampFrames(
    [
      ['..........w.w.', 'w.........wwww', '.w.wwwwwwwwwkw', '..wwwwwwwwwwwp', '..wwwwwwwww...', '..w.w....w.w..', '.w...w..w...w.'],
      ['..........w.w.', '..........wwww', 'ww.wwwwwwwwwkw', '..wwwwwwwwwwwp', '..wwwwwwwww...', '...ww...ww....', '...w.w..w.w...'],
    ],
    { w: PAL.white, k: PAL.ink, p: TEAM_RAMPS.red[3] },
    16,
    10,
  );

export const phoenixFrames = (): EffectSheet => {
  const F = PAL.fire;
  return stampFrames(
    [
      [
        '.........yy.',
        '.o......yyWk',
        '.oo....yyyy.',
        '..oo..yyyo..',
        '...oooyyoo..',
        '....oyyoo...',
        '...rryoo....',
        '..rrrr......',
        '.rrr.r......',
        'rr...r......',
      ],
      [
        '.........yy.',
        '........yyWk',
        '.......yyyy.',
        '.....oyyyo..',
        'oooooyyoo...',
        '..oooyyoo...',
        '...rryoo....',
        '..rr.r......',
        '..r..rr.....',
        '.r....r.....',
      ],
    ],
    { y: F[3], W: F[4], o: F[2], r: F[1], k: PAL.ink },
    14,
    12,
    F[0],
  );
};

export const dragonFrames = (): EffectSheet => {
  const I = PAL.ice;
  return centered(
    [0, 1].map((f) => {
      const b = new PixelBuffer(50, 20);
      // serpentine body from tail (left) to head (right)
      for (let x = 2; x < 40; x++) {
        const t = x / 40;
        const y = 10 + Math.sin(t * Math.PI * 2.4 + f * Math.PI) * 4 * (1 - t * 0.5);
        const thick = 1 + t * 3;
        b.line(x, y - thick / 2, x, y + thick / 2, I[2], 1);
        b.set(x, y - thick / 2, I[3]);
        if (x % 4 === 0) b.set(x, y + thick / 2, I[1]); // belly scales
        if (x % 6 === 3) b.set(x, y - thick / 2 - 1, PAL.white); // mane
      }
      // head
      b.rect(38, 6, 8, 7, I[2]);
      b.rect(38, 6, 8, 2, I[3]);
      b.rect(44, 9, 4, 3, I[2]);
      b.set(42, 8, PAL.gold[3]); // eye
      b.line(40, 5, 36, 2, PAL.gold[2], 1); // horn
      b.line(46, 12, 49, 14 + f, I[3], 1); // whisker
      b.set(47, 12, PAL.white); // fang
      b.outline(I[0]);
      return b;
    }),
  );
};

export const turtleFrames = (): EffectSheet => {
  const M = PAL.moss;
  const G = PAL.gold;
  return centered(
    [0, 1].map((f) => {
      const b = new PixelBuffer(34, 24);
      // shell dome
      for (let y = 0; y < 14; y++) {
        const half = Math.sqrt(Math.max(0, 1 - ((13 - y) / 13) ** 2)) * 14;
        for (let x = Math.round(16 - half); x <= 16 + half; x++) b.set(x, y + 4, y < 4 ? M[3] : M[2]);
      }
      // hex plates + gold rim
      for (const [x, y] of [[10, 10], [16, 8], [22, 10], [13, 14], [19, 14]] as P[]) {
        b.ring(x, y, 2, 1, M[1]);
        b.set(x, y - 1, G[3]);
      }
      b.rect(2, 17, 29, 2, G[2]);
      b.rect(2, 17, 29, 1, G[3]);
      // legs and head (head peeks out on frame 1)
      b.rect(5, 19, 4, 3, M[2]);
      b.rect(23, 19, 4, 3, M[2]);
      b.rect(30 - (f ? 0 : 2), 13, 4, 4, M[2]);
      b.set(32 - (f ? 0 : 2), 14, PAL.ink);
      b.outline();
      return b;
    }),
  );
};
