import { HUNTERS_LIBRARY } from '@magiclash/shared';
import { PixelBuffer, dither2, hashNoise } from '../render/pixelBuffer';
import { PAL } from '../render/palette';
import { type StageArt, type TorchSpot } from './castleCourtyardArt';
import { gradientSky, layerBuffer, makeLayer, paintSolid } from './stageKit';

/**
 * HUNTERS' LIBRARY (Temporada 1) — arquivo secreto de uma ordem de caçadores de monstros. Estantes
 * que somem no escuro, uma janela redonda com luar azul, candelabros quentes e armas penduradas.
 * As plataformas são prateleiras de madeira clara com livros em cima.
 */

const W = PAL.wood;
const Lh = PAL.leather;
const I = PAL.ice;

/** Book spine colors (muted, warm): leather, moss, wine, navy, gold. */
const SPINES = [Lh[1], Lh[2], PAL.moss[1], PAL.moss[2], 0x8c2230, 0x4a1420, PAL.steel[1], 0x1d2b5e, PAL.gold[1]];

/** Fills a bookshelf column: frame, shelves every `rowH`, books with varying heights. */
const shelf = (b: PixelBuffer, x0: number, y0: number, w: number, h: number, rowH: number, seed: number, dim: boolean) => {
  const frame = dim ? W[0] : W[1];
  const board = dim ? W[1] : W[2];
  b.rect(x0, y0, w, h, dim ? PAL.ink : W[0]);
  b.rect(x0, y0, 3, h, frame);
  b.rect(x0 + w - 3, y0, 3, h, frame);
  for (let y = y0 + rowH; y < y0 + h; y += rowH) {
    b.rect(x0, y, w, 3, board);
    b.rect(x0, y, w, 1, dim ? W[2] : W[3]);
    let x = x0 + 4;
    let i = 0;
    while (x < x0 + w - 6) {
      const bw = 2 + Math.floor(hashNoise(x, y, seed) * 3);
      const bh = rowH - 6 - Math.floor(hashNoise(x, y, seed + 1) * 6);
      const col = SPINES[Math.floor(hashNoise(i, y, seed + 2) * SPINES.length)];
      if (hashNoise(x, y, seed + 3) > 0.9) {
        x += 4; // gap
        i++;
        continue;
      }
      b.rect(x, y - bh, bw, bh, col);
      if (!dim) b.set(x, y - bh + 2, PAL.gold[2]); // gilded band
      if (dim) for (let yy = y - bh; yy < y; yy++) if (dither2(x, yy, 0.5)) b.set(x + bw - 1, yy, PAL.ink);
      x += bw + (hashNoise(x, i, seed + 4) > 0.8 ? 1 : 0);
      i++;
    }
  }
};

const drawSky = (): PixelBuffer => {
  const b = gradientSky([PAL.ink, W[0], Lh[0], W[0]], 320);
  // Round window with blue moonlight and mullions.
  const cx = 320;
  const cy = 92;
  const r = 52;
  b.disc(cx, cy, r + 5, W[0]);
  b.disc(cx, cy, r, I[0]);
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      if (dither2(x, y, Math.max(0, 1 - d / r) * 0.8)) b.set(x, y, I[1]);
    }
  }
  b.disc(cx + 16, cy - 14, 11, I[3]); // the moon
  b.disc(cx + 13, cy - 16, 8, I[4]);
  b.ring(cx, cy, r, 3, W[1]);
  b.rect(cx - 1, cy - r, 3, r * 2, W[1]);
  b.rect(cx - r, cy - 1, r * 2, 3, W[1]);
  // pale light beam across the room
  for (let y = cy + r; y < 360; y++) {
    const k = (y - cy - r) / (360 - cy - r);
    for (let x = cx - 40 - k * 60; x < cx + 30 + k * 30; x++) if (dither2(x, y, 0.16 * (1 - k))) b.set(x, y, I[1]);
  }
  return b;
};

/** Pulls a layer back in depth: ordered ink dither over everything drawn so far. */
const recede = (b: PixelBuffer, amount: number) => {
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.alphaAt(x, y) && dither2(x, y, amount)) b.set(x, y, PAL.ink);
};

/** Far shelves: tall and dark, fading up into the gloom. */
const drawFarShelves = (sf: number): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  for (let x = 0; x < b.w; x += 70) {
    if (Math.abs(x + 30 - b.w / 2) < 80) continue; // keep the window clear
    shelf(b, x, 40 + my, 60, b.h - 40 - my, 26, 201 + x, true);
  }
  // gallery railing high up
  b.rect(0, 36 + my, b.w, 3, W[1]);
  for (let x = 0; x < b.w; x += 8) b.rect(x, 20 + my, 2, 16, W[0]);
  recede(b, 0.5);
  return b;
};

/** Near shelves with ladders, hanging weapons and candelabras (torch spots). */
const drawNearShelves = (sf: number, torches: TorchSpot[], key: string): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  const top = 120 + my;
  for (const x0 of [10, b.w - 130]) {
    shelf(b, x0, top, 120, b.h - top, 30, 301 + x0, true);
    // rolling ladder
    const lx = x0 + 88;
    b.line(lx, top - 6, lx + 16, b.h, W[3], 2);
    b.line(lx + 10, top - 6, lx + 26, b.h, W[3], 2);
    for (let k = 0; k < 20; k++) {
      const y = top + k * 12;
      const t = (y - top + 6) / (b.h - top + 6);
      b.line(lx + t * 16, y, lx + 10 + t * 16, y, W[2], 1);
    }
  }
  // crossed weapons on the wall between the shelves
  const cx = Math.round(b.w / 2);
  const wy = top + 96;
  b.line(cx - 22, wy + 30, cx + 22, wy - 10, PAL.steel[2], 2);
  b.line(cx + 22, wy + 30, cx - 22, wy - 10, PAL.steel[2], 2);
  b.line(cx - 22, wy + 30, cx - 16, wy + 24, Lh[1], 3);
  b.line(cx + 22, wy + 30, cx + 16, wy + 24, Lh[1], 3);
  // coiled whip hung between them
  b.ring(cx, wy + 34, 7, 1, Lh[2]);
  b.ring(cx, wy + 34, 4, 1, Lh[1]);
  // candelabras
  for (const tx of [150, b.w - 150]) {
    const ty = top + 36;
    b.rect(tx - 5, ty, 11, 2, PAL.gold[1]);
    b.rect(tx - 1, ty + 2, 3, 12, PAL.gold[1]);
    b.rect(tx - 4, ty + 14, 9, 2, PAL.gold[2]);
    torches.push({ layer: key, u: tx, v: ty });
  }
  recede(b, 0.25);
  return b;
};

const WORLD_X = -300;
const WORLD_Y = -280;

const drawGameplay = (): PixelBuffer => {
  const b = new PixelBuffer(600, 580);
  const at = (x: number, y: number) => [x - WORLD_X, y - WORLD_Y] as const;
  const [floor, base] = HUNTERS_LIBRARY.solids;
  {
    const [x0, y0] = at(base.x, base.y);
    paintSolid(b, x0, y0, base.w, b.h - y0, { top: [PAL.stone[2], PAL.stone[3]], body: [PAL.stone[0], PAL.stone[1], PAL.stone[2]], mortar: PAL.ink }, 18, 9, 401);
  }
  {
    // wooden floorboards over a stone foundation
    const [x0, y0] = at(floor.x, floor.y);
    for (let y = 0; y < floor.h; y++) {
      for (let x = 0; x < floor.w; x++) {
        let c: number = y === 0 ? W[3] : y < 3 ? W[2] : W[1];
        if (y >= 3 && (x + (Math.floor(y / 6) % 2) * 20) % 40 === 0) c = W[0];
        if (y >= 3 && y % 6 === 0) c = W[0];
        if (x === 0 || x === floor.w - 1) c = W[0];
        b.set(x0 + x, y0 + y, c);
      }
    }
    // a rug in the middle
    b.rect(x0 + floor.w / 2 - 60, y0, 120, 2, 0x8c2230);
    for (let x = x0 + floor.w / 2 - 60; x < x0 + floor.w / 2 + 60; x += 3) b.set(x, y0 + 1, PAL.gold[2]);
  }
  // shelf-board platforms with books and brackets
  for (const [i, p] of HUNTERS_LIBRARY.platforms.entries()) {
    const [x0, y0] = at(p.x, p.y);
    b.rect(x0, y0, p.w, 4, W[3]);
    b.rect(x0, y0, p.w, 1, PAL.gold[3]);
    b.rect(x0, y0 + 3, p.w, 1, W[0]);
    for (const bx of [x0 + 4, x0 + p.w - 7]) {
      b.rect(bx, y0 + 4, 3, 6, PAL.steel[1]);
      b.line(bx, y0 + 10, bx - 3, y0 + 4, PAL.steel[1]);
    }
    // books lying / standing on the board (never taller than 8 px, so fighters stay readable)
    let x = x0 + 10;
    while (x < x0 + p.w - 12) {
      const standing = hashNoise(x, i, 402) > 0.4;
      const col = SPINES[Math.floor(hashNoise(x, i, 403) * SPINES.length)];
      if (standing) {
        const h = 5 + Math.floor(hashNoise(x, i, 404) * 3);
        b.rect(x, y0 - h, 3, h, col);
        b.set(x, y0 - h + 1, PAL.gold[2]);
        x += 4;
      } else {
        b.rect(x, y0 - 3, 8, 3, col);
        b.rect(x, y0 - 3, 8, 1, PAL.steel[3]);
        x += 10;
      }
      if (hashNoise(x, i, 405) > 0.7) x += 6;
    }
  }
  return b;
};

export const buildHuntersLibraryArt = (): StageArt => {
  const torches: TorchSpot[] = [];
  return {
    parallax: [
      { key: 'hl_sky', buf: drawSky(), sf: 0, mx: 0, my: 0, depth: -100 },
      makeLayer('hl_far', 0.15, drawFarShelves(0.15), -90),
      makeLayer('hl_near', 0.45, drawNearShelves(0.45, torches, 'hl_near'), -70),
    ],
    world: { key: 'hl_world', buf: drawGameplay(), x: WORLD_X, y: WORLD_Y, depth: -10 },
    torches,
    ambient: 'dust',
  };
};
