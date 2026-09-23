import { FROZEN_FORTRESS } from '@magiclash/shared';
import { PixelBuffer, dither2, hashNoise } from '../render/pixelBuffer';
import { PAL } from '../render/palette';
import { smoothNoise, type StageArt, type TorchSpot } from './castleCourtyardArt';
import { chainUp, gradientSky, layerBuffer, makeLayer, moon, paintSolid, ridge, stars } from './stageKit';

/**
 * FROZEN FORTRESS — noite polar com aurora, montanhas nevadas e muralhas de gelo. Braseiros
 * quentes na muralha dão o contraponto de cor; plataformas de gelo são claras e legíveis.
 */

const I = PAL.ice;
const S = PAL.stone;

const drawSky = (): PixelBuffer => {
  const b = gradientSky([PAL.sky[0], PAL.sky[1], 0x1a3552, 0x2f6fa0], 290);
  stars(b, 60, 140, [PAL.steel[4], I[3], PAL.sky[4]], 91);
  // aurora ribbons (dithered, palette-only)
  for (let band = 0; band < 2; band++) {
    for (let x = 0; x < b.w; x++) {
      const cy = 60 + band * 26 + Math.round(Math.sin(x / 57 + band * 2) * 14 + smoothNoise(x / 30, 92 + band) * 10);
      for (let t = 0; t < 14; t++) {
        const y = cy + t;
        const k = 1 - t / 14;
        if (dither2(x, y, k * 0.45)) b.set(x, y, t < 2 ? PAL.moss[3] : band ? I[1] : PAL.moss[1]);
      }
    }
  }
  moon(b, 520, 58, 12, PAL.steel[4], I[3], I[1]);
  return b;
};

const drawMountains = (sf: number): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  ridge(b, 180 + my, 70, 90, 93, I[1], { color: PAL.steel[4], depth: 6 });
  ridge(b, 220 + my, 40, 60, 94, I[0], { color: I[3], depth: 3 });
  return b;
};

const drawWalls = (sf: number, torches: TorchSpot[], key: string): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  const top = 150 + my;
  const floor = 290 + my;
  for (let y = top; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const row = Math.floor((y - top) / 10);
      const bx = (x + (row % 2) * 9) % 18;
      let c: number = I[0];
      if (bx === 0 || (y - top) % 10 === 0) c = PAL.sky[0];
      else if ((y - top) % 10 === 1 && hashNoise(Math.floor(x / 18), row, 95) > 0.6) c = I[1];
      if (y >= floor) c = dither2(x, y, (y - floor) / 50) ? PAL.ink : PAL.sky[0];
      b.set(x, y, c);
    }
  }
  // snow on the battlements + icicles
  for (let x = 0; x < b.w; x += 22) {
    b.rect(x, top - 12, 13, 12, I[0]);
    b.rect(x, top - 13, 13, 2, PAL.steel[4]);
  }
  b.rect(0, top, b.w, 2, PAL.steel[4]);
  for (let x = 2; x < b.w; x += 5) {
    const len = 2 + Math.floor(hashNoise(x, 0, 96) * 7);
    for (let y = 0; y < len; y++) b.set(x, top + 2 + y, y < len - 1 ? I[3] : I[4]);
  }
  // braziers with warm light
  for (const tx of [Math.round(b.w / 2) - 170, Math.round(b.w / 2) + 170]) {
    const ty = top + 70;
    for (let y = -20; y <= 20; y++) {
      for (let x = -20; x <= 20; x++) {
        const d = Math.hypot(x, y * 1.2);
        const px = tx + x;
        const py = ty + y;
        if (d < 20 && py > top + 2 && dither2(px, py, Math.max(0, 1 - d / 20) * 0.7)) {
          b.set(px, py, b.colorAt(px, py) === I[0] ? PAL.gold[0] : PAL.leather[0]);
        }
      }
    }
    b.rect(tx - 4, ty, 9, 3, PAL.steel[1]);
    b.rect(tx - 1, ty + 3, 3, 8, PAL.steel[0]);
    torches.push({ layer: key, u: tx, v: ty });
  }
  return b;
};

const WORLD_X = -260;
const WORLD_Y = -220;

const drawGameplay = (): PixelBuffer => {
  const b = new PixelBuffer(520, 520);
  const at = (x: number, y: number) => [x - WORLD_X, y - WORLD_Y] as const;
  const [main, base] = FROZEN_FORTRESS.solids;

  for (const p of FROZEN_FORTRESS.platforms) {
    chainUp(b, at(p.x + 6, 0)[0], at(0, p.y)[1]);
    chainUp(b, at(p.x + p.w - 7, 0)[0], at(0, p.y)[1]);
  }
  // base block
  {
    const [x0, y0] = at(base.x, base.y);
    paintSolid(b, x0, y0, base.w, base.h, { top: [S[2], S[3]], body: [I[0], S[1], S[2]], mortar: PAL.sky[0] }, 14, 9, 97);
    // big icicles under the base
    for (let x = 4; x < base.w - 4; x += 9) {
      const len = 8 + Math.floor(hashNoise(x, 1, 98) * 22);
      for (let y = 0; y < len; y++) {
        const half = Math.max(0, 2 - Math.floor((y / len) * 3));
        b.rect(x0 + x - half, y0 + base.h + y, half * 2 + 1, 1, y < len * 0.3 ? I[2] : I[3]);
      }
    }
  }
  // main rampart: snow top, icy stone
  {
    const [x0, y0] = at(main.x, main.y);
    paintSolid(b, x0, y0, main.w, main.h, { top: [I[3], PAL.steel[4]], body: [I[0], S[2], S[3]], mortar: S[0] }, 20, 9, 99);
    for (let x = 0; x < main.w; x++) {
      const drift = Math.round(smoothNoise(x / 6, 100) * 3);
      for (let y = 0; y < 3 + drift; y++) b.set(x0 + x, y0 + y, y === 0 ? PAL.white : PAL.steel[4]);
      if (x % 7 === 3) for (let y = 0; y < 4 + (x % 3); y++) b.set(x0 + x, y0 + 5 + drift + y, I[3]);
    }
  }
  // floating ice slabs
  for (const p of FROZEN_FORTRESS.platforms) {
    const [x0, y0] = at(p.x, p.y);
    for (let x = 0; x < p.w; x++) {
      b.set(x0 + x, y0, PAL.white);
      b.set(x0 + x, y0 + 1, I[4]);
      b.set(x0 + x, y0 + 2, I[3]);
      b.set(x0 + x, y0 + 3, x % 13 === 0 ? I[1] : I[2]);
      b.set(x0 + x, y0 + 4, I[1]);
    }
    for (let x = 3; x < p.w - 3; x += 6) {
      const len = 3 + (x % 4);
      for (let y = 0; y < len; y++) b.set(x0 + x, y0 + 5 + y, y < len - 1 ? I[2] : I[3]);
    }
  }
  return b;
};

export const buildFrozenFortressArt = (): StageArt => {
  const torches: TorchSpot[] = [];
  return {
    parallax: [
      { key: 'ff_sky', buf: drawSky(), sf: 0, mx: 0, my: 0, depth: -100 },
      makeLayer('ff_mountains', 0.12, drawMountains(0.12), -90),
      makeLayer('ff_walls', 0.5, drawWalls(0.5, torches, 'ff_walls'), -70),
    ],
    world: { key: 'ff_world', buf: drawGameplay(), x: WORLD_X, y: WORLD_Y, depth: -10 },
    torches,
    ambient: 'snow',
  };
};
