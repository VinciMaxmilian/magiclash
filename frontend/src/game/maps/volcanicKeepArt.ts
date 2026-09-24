import { VOLCANIC_KEEP } from '@magiclash/shared';
import { PixelBuffer, dither2, hashNoise } from '../render/pixelBuffer';
import { PAL } from '../render/palette';
import { smoothNoise, type StageArt, type TorchSpot } from './castleCourtyardArt';
import { chainUp, gradientSky, layerBuffer, makeLayer, paintSolid, ridge } from './stageKit';

/**
 * VOLCANIC KEEP — fortaleza de basalto sobre um mar de lava, com um vulcão em erupção ao fundo.
 * Céu vermelho-escuro com cinzas; toda a luz vem de baixo (lava) e das janelas. O chão jogável
 * tem borda clara de pedra para continuar legível contra o fundo quente.
 */

const F = PAL.fire;
const S = PAL.stone;

const drawSky = (): PixelBuffer => {
  const b = gradientSky([PAL.ink, F[0], PAL.leather[0], F[1]], 320);
  // ash specks
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hashNoise(i, 1, 81) * b.w);
    const y = Math.floor(hashNoise(i, 2, 81) * 240);
    b.set(x, y, i % 3 === 0 ? PAL.stone[2] : PAL.leather[1]);
  }
  return b;
};

const drawVolcano = (sf: number): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  const cx = Math.round(b.w * 0.62);
  const peak = 110 + my;
  for (let y = peak; y < b.h; y++) {
    const half = 30 + (y - peak) * 1.35;
    for (let x = Math.round(cx - half); x <= cx + half; x++) {
      // lit right flank: a thin edge, dithered inwards (no hard wedge)
      const fromEdge = cx + half - x;
      const lit = fromEdge < 3 || (fromEdge < 14 && dither2(x, y, (1 - fromEdge / 14) * 0.5));
      b.set(x, y, lit ? PAL.leather[0] : PAL.ink);
    }
  }
  // crater glow + lava rivers
  b.rect(cx - 28, peak, 56, 3, F[2]);
  b.rect(cx - 20, peak - 1, 40, 1, F[3]);
  for (const dir of [-1, 1]) {
    let x = cx + dir * 10;
    for (let y = peak + 3; y < b.h; y++) {
      x += dir * (hashNoise(y, dir + 2, 82) > 0.6 ? 1 : 0);
      b.set(x, y, y % 7 === 0 ? F[3] : F[2]);
      b.set(x + 1, y, F[1]);
    }
  }
  // eruption plume (dithered)
  for (let y = 0; y < peak; y++) {
    const w = 10 + (peak - y) * 0.5;
    for (let x = -w; x <= w; x++) {
      const k = 0.5 * (1 - Math.abs(x) / w) * (y / peak);
      if (dither2(cx + x, y, k)) b.set(Math.round(cx + x + smoothNoise(y / 12, 83) * 16 - 8), y, y > peak - 30 ? F[1] : PAL.leather[1]);
    }
  }
  ridge(b, 260 + my, 26, 70, 84, PAL.ink, { color: F[0], depth: 2 }, 12);
  return b;
};

const drawKeepWalls = (sf: number, torches: TorchSpot[], key: string): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  const top = 176 + my;
  for (let y = top; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const row = Math.floor((y - top) / 12);
      const bx = (x + (row % 2) * 10) % 20;
      let c: number = S[0];
      if (bx === 0 || (y - top) % 12 === 0) c = PAL.ink;
      else if ((y - top) % 12 === 1) c = S[1];
      // lava light from below on the lower wall
      if (y > top + 90 && dither2(x, y, Math.min(1, (y - top - 90) / 60) * 0.55)) c = F[0];
      b.set(x, y, c);
    }
  }
  for (let x = 0; x < b.w; x += 24) {
    b.rect(x, top - 14, 14, 14, S[0]);
    b.rect(x, top - 14, 14, 1, S[1]);
  }
  // glowing slit windows
  for (let x = 30; x < b.w; x += 48) {
    b.rect(x, top + 24, 5, 16, PAL.ink);
    b.rect(x + 1, top + 26, 3, 12, F[2]);
    b.rect(x + 1, top + 26, 3, 3, F[3]);
  }
  for (const tx of [Math.round(b.w / 2) - 120, Math.round(b.w / 2) + 120]) {
    const ty = top + 60;
    b.rect(tx - 4, ty, 9, 3, PAL.steel[1]);
    b.rect(tx - 1, ty + 3, 3, 8, PAL.steel[0]);
    torches.push({ layer: key, u: tx, v: ty });
  }
  return b;
};

// Wider than the other maps: the lava sea must reach both screen edges at any camera position.
const WORLD_X = -460;
const WORLD_Y = -220;

const drawGameplay = (): PixelBuffer => {
  const b = new PixelBuffer(920, 520);
  const at = (x: number, y: number) => [x - WORLD_X, y - WORLD_Y] as const;
  const [main, base] = VOLCANIC_KEEP.solids;

  // lava sea at the bottom of the scene (decor only: death is still the blast zone)
  const [, lavaY] = at(0, 92);
  for (let y = lavaY; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const wave = Math.round(Math.sin(x / 9) * 1.5 + smoothNoise(x / 14, 85) * 3);
      if (y < lavaY + wave) continue;
      const d = y - lavaY - wave;
      let c: number = d < 2 ? F[4] : d < 5 ? F[3] : F[2];
      if (d > 8 && hashNoise(Math.floor(x / 5), Math.floor(y / 3), 86) > 0.82) c = F[1];
      b.set(x, y, c);
    }
  }
  for (const p of VOLCANIC_KEEP.platforms) {
    chainUp(b, at(p.x + 5, 0)[0], at(0, p.y)[1]);
    chainUp(b, at(p.x + p.w - 6, 0)[0], at(0, p.y)[1]);
  }
  {
    const [x0, y0] = at(base.x, base.y);
    paintSolid(b, x0, y0, base.w, base.h, { top: [S[1], S[2]], body: [PAL.ink, S[0], S[1]], mortar: PAL.ink }, 16, 10, 87);
    // glowing cracks + lava drips
    for (let i = 0; i < 9; i++) {
      let x = x0 + 10 + Math.round(hashNoise(i, 0, 88) * (base.w - 20));
      for (let y = y0 + 8; y < y0 + base.h; y++) {
        if (hashNoise(i, y, 89) > 0.7) x += hashNoise(i, y, 90) > 0.5 ? 1 : -1;
        b.set(x, y, y % 5 === 0 ? F[3] : F[2]);
      }
    }
  }
  {
    const [x0, y0] = at(main.x, main.y);
    paintSolid(b, x0, y0, main.w, main.h, { top: [S[3], S[4]], body: [S[0], S[1], S[2]], mortar: PAL.ink }, 20, 10, 91);
    for (let x = 0; x < main.w; x += 3) if (hashNoise(x, 1, 92) > 0.75) b.set(x0 + x, y0 + 5 + Math.round(hashNoise(x, 2, 92) * 30), F[2]);
  }
  // iron grate platforms
  for (const p of VOLCANIC_KEEP.platforms) {
    const [x0, y0] = at(p.x, p.y);
    for (let x = 0; x < p.w; x++) {
      b.set(x0 + x, y0, PAL.steel[4]);
      b.set(x0 + x, y0 + 1, PAL.steel[3]);
      b.set(x0 + x, y0 + 2, x % 4 === 0 ? PAL.steel[2] : PAL.ink);
      b.set(x0 + x, y0 + 3, x % 4 === 0 ? PAL.steel[2] : PAL.ink);
      b.set(x0 + x, y0 + 4, PAL.steel[1]);
    }
  }
  return b;
};

export const buildVolcanicKeepArt = (): StageArt => {
  const torches: TorchSpot[] = [];
  return {
    parallax: [
      { key: 'vk_sky', buf: drawSky(), sf: 0, mx: 0, my: 0, depth: -100 },
      makeLayer('vk_volcano', 0.12, drawVolcano(0.12), -90),
      makeLayer('vk_walls', 0.5, drawKeepWalls(0.5, torches, 'vk_walls'), -70),
    ],
    world: { key: 'vk_world', buf: drawGameplay(), x: WORLD_X, y: WORLD_Y, depth: -10 },
    torches,
    ambient: 'embers',
  };
};
