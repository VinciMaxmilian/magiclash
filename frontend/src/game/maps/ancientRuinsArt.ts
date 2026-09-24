import { ANCIENT_RUINS } from '@magiclash/shared';
import { PixelBuffer, dither2, hashNoise } from '../render/pixelBuffer';
import { PAL } from '../render/palette';
import { smoothNoise, type StageArt } from './castleCourtyardArt';
import { gradientSky, layerBuffer, makeLayer, paintSolid, ridge } from './stageKit';

/**
 * ANCIENT RUINS — fim de tarde num templo esquecido. Sol baixo e quente, colinas com um
 * zigurate distante, colunata quebrada com trepadeiras. A pedra jogável é arenito claro com
 * musgo no topo; as plataformas são capitéis de colunas que ainda estão de pé.
 */

const S = PAL.stone;
const M = PAL.moss;
const SAND = [PAL.leather[1], PAL.leather[2], PAL.leather[3], PAL.skin[3]] as const;

const drawSky = (): PixelBuffer => {
  const b = gradientSky([PAL.sky[2], PAL.sky[3], PAL.sky[4], PAL.sky[5], PAL.sky[6]], 250);
  // low sun with banded glow
  const sx = 200;
  const sy = 196;
  for (let y = -60; y <= 60; y++) {
    for (let x = -60; x <= 60; x++) {
      const d = Math.hypot(x, y);
      if (d < 28) b.set(sx + x, sy + y, d < 24 ? PAL.fire[4] : PAL.fire[3]);
      else if (d < 60 && dither2(sx + x, sy + y, (1 - d / 60) * 0.5)) b.set(sx + x, sy + y, PAL.sky[6]);
    }
  }
  // thin cloud streaks
  for (let i = 0; i < 6; i++) {
    const y = 60 + i * 22;
    const x0 = Math.round(hashNoise(i, 0, 61) * 500);
    const len = 60 + Math.round(hashNoise(i, 1, 61) * 90);
    b.rect(x0, y, len, 2, PAL.sky[4]);
    b.rect(x0 + 8, y + 2, len - 16, 1, PAL.sky[3]);
  }
  return b;
};

const drawHills = (sf: number): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  ridge(b, 250 + my, 30, 110, 62, PAL.sky[2]);
  // ziggurat silhouette
  const zx = Math.round(b.w * 0.68);
  const base = 240 + my;
  for (let step = 0; step < 6; step++) {
    const w = 120 - step * 18;
    b.rect(zx - w / 2, base - step * 11 - 11, w, 11, PAL.sky[2]);
    b.rect(zx - w / 2, base - step * 11 - 11, w, 1, PAL.sky[3]);
  }
  b.rect(zx - 5, base - 80, 10, 14, PAL.sky[2]);
  ridge(b, 272 + my, 22, 60, 63, M[0], { color: M[1], depth: 2 });
  return b;
};

/** A column of `h` pixels (fluted shaft, capital, base) standing on `groundY`. */
const column = (b: PixelBuffer, cx: number, groundY: number, h: number, broken: boolean, ramp: readonly number[]) => {
  const w = 14;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const flute = x % 4 === 0 ? ramp[0] : x < 3 ? ramp[1] : x > w - 4 ? ramp[3] : ramp[2];
      b.set(cx - w / 2 + x, groundY - y, flute);
    }
  }
  b.rect(cx - w / 2 - 3, groundY - 4, w + 6, 4, ramp[1]);
  if (broken) {
    for (let x = 0; x < w; x++) {
      const cut = Math.round(hashNoise(cx + x, 0, 64) * 6);
      for (let y = 0; y < cut; y++) b.clear(cx - w / 2 + x, groundY - h + y);
    }
  } else {
    b.rect(cx - w / 2 - 4, groundY - h - 5, w + 8, 5, ramp[2]);
    b.rect(cx - w / 2 - 4, groundY - h - 5, w + 8, 1, ramp[3]);
  }
};

const vines = (b: PixelBuffer, x0: number, y0: number, w: number, seed: number) => {
  for (let x = 0; x < w; x += 3) {
    const len = Math.round(hashNoise(x, 0, seed) * 16);
    for (let y = 0; y < len; y++) {
      const sway = Math.round(Math.sin((y + x) / 4));
      b.set(x0 + x + sway, y0 + y, y % 4 === 3 ? M[3] : M[2]);
    }
  }
};

const drawColonnade = (sf: number): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  const ground = 300 + my;
  const ramp = [S[0], S[1], S[2], S[3]];
  for (let i = 0; i < 12; i++) {
    const cx = 24 + i * Math.round((b.w - 48) / 11);
    const h = 70 + Math.round(hashNoise(i, 0, 65) * 60);
    const broken = hashNoise(i, 1, 65) > 0.55;
    column(b, cx, ground, broken ? Math.round(h * 0.6) : h, broken, ramp);
    if (!broken) vines(b, cx - 10, ground - h - 5, 20, 66 + i);
  }
  // architrave fragments across unbroken neighbours
  b.rect(0, ground, b.w, b.h - ground, S[0]);
  for (let x = 0; x < b.w; x++) if (hashNoise(x, 0, 67) > 0.6) b.set(x, ground, M[1]);
  return b;
};

const WORLD_X = -260;
const WORLD_Y = -220;

const drawGameplay = (): PixelBuffer => {
  const b = new PixelBuffer(520, 520);
  const at = (x: number, y: number) => [x - WORLD_X, y - WORLD_Y] as const;
  const [step, main, base] = ANCIENT_RUINS.solids;
  const style = { top: [SAND[2], SAND[3]], body: [SAND[0], SAND[1], SAND[2]], mortar: PAL.leather[0] };

  // columns under the one-way capitals reach down to the floor
  for (const p of ANCIENT_RUINS.platforms) {
    const [cx] = at(p.x + p.w / 2, 0);
    const [, floorY] = at(0, 0);
    const [, topY] = at(0, p.y);
    column(b, cx, floorY - 1, floorY - topY - 4, false, [S[0], S[1], S[2], S[3]]);
  }
  {
    const [x0, y0] = at(base.x, base.y);
    paintSolid(b, x0, y0, base.w, base.h, { top: [S[1], S[2]], body: [S[0], S[1], S[2]], mortar: PAL.ink }, 22, 11, 68);
    // roots hanging from the foundation
    for (let x = 6; x < base.w - 6; x += 11) {
      const len = 6 + Math.round(hashNoise(x, 2, 69) * 20);
      for (let y = 0; y < len; y++) b.set(x0 + x + Math.round(Math.sin(y / 3)), y0 + base.h + y, PAL.wood[y % 5 === 0 ? 2 : 1]);
    }
  }
  for (const [s, seed] of [[main, 70], [step, 71]] as const) {
    const [x0, y0] = at(s.x, s.y);
    paintSolid(b, x0, y0, s.w, s.h, style, 18, 9, seed);
    // moss lip on the walkable top
    for (let x = 0; x < s.w; x++) {
      const d = Math.round(smoothNoise(x / 5, seed) * 3);
      for (let y = 0; y < 1 + d; y++) b.set(x0 + x, y0 + y, y === 0 ? M[3] : M[2]);
    }
    vines(b, x0 + 4, y0 + 4, s.w - 8, seed + 10);
  }
  // capitals (the one-way platforms): carved stone slab + moss
  for (const p of ANCIENT_RUINS.platforms) {
    const [x0, y0] = at(p.x, p.y);
    for (let x = 0; x < p.w; x++) {
      b.set(x0 + x, y0, M[3]);
      b.set(x0 + x, y0 + 1, hashNoise(x, 0, 72) > 0.5 ? M[2] : SAND[3]);
      b.set(x0 + x, y0 + 2, SAND[2]);
      b.set(x0 + x, y0 + 3, x % 6 === 0 ? SAND[0] : SAND[1]);
      b.set(x0 + x, y0 + 4, PAL.leather[0]);
    }
    vines(b, x0 + 2, y0 + 5, p.w - 4, 73 + p.x);
  }
  return b;
};

export const buildAncientRuinsArt = (): StageArt => ({
  parallax: [
    { key: 'ar_sky', buf: drawSky(), sf: 0, mx: 0, my: 0, depth: -100 },
    makeLayer('ar_hills', 0.12, drawHills(0.12), -90),
    makeLayer('ar_colonnade', 0.45, drawColonnade(0.45), -70),
  ],
  world: { key: 'ar_world', buf: drawGameplay(), x: WORLD_X, y: WORLD_Y, depth: -10 },
  torches: [],
  ambient: 'fireflies',
});
