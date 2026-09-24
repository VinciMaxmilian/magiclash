import { THRONE_HALL } from '@magiclash/shared';
import { PixelBuffer, dither2, hashNoise } from '../render/pixelBuffer';
import { PAL, TEAM_RAMPS } from '../render/palette';
import { type StageArt, type TorchSpot } from './castleCourtyardArt';
import { gradientSky, layerBuffer, makeLayer, paintSolid } from './stageKit';

/**
 * THRONE HALL (Temporada 1) — salão do trono de um castelo vampírico, à noite. Um grande vitral
 * ogival com a lua vermelha ao fundo, arcadas góticas e estandartes carmesim; no palco, um tapete
 * vermelho sobe até o estrado e três lustres de ferro servem de plataforma.
 */

const S = PAL.stone;
const R = TEAM_RAMPS.red;
const V = PAL.sky;

const WINDOW_CX = 320;

/**
 * Equilateral pointed (gothic) arch: tip at (cx, top), width w, total height h. Inside the
 * straight part below the springing line, or inside both arcs (each centered on the opposite
 * springing point, radius w) above it.
 */
const inArch = (x: number, y: number, cx: number, top: number, w: number, h: number): boolean => {
  const half = w / 2;
  const px = x + 0.5;
  if (Math.abs(px - cx) > half || y < top || y > top + h) return false;
  const springY = top + w * 0.866;
  if (y >= springY) return true;
  return Math.hypot(px - (cx + half), y - springY) <= w && Math.hypot(px - (cx - half), y - springY) <= w;
};

const drawSky = (): PixelBuffer => {
  const b = gradientSky([PAL.ink, V[0], V[0], V[1]], 330);
  // Great stained-glass window with the red moon behind it.
  const top = 26;
  const w = 150;
  const h = 250;
  for (let y = top; y < top + h; y++) {
    for (let x = WINDOW_CX - w / 2 - 6; x < WINDOW_CX + w / 2 + 6; x++) {
      if (inArch(x, y, WINDOW_CX, top - 6, w + 12, h + 6)) b.set(x, y, S[0]); // stone frame
    }
  }
  for (let y = top; y < top + h; y++) {
    for (let x = WINDOW_CX - w / 2; x < WINDOW_CX + w / 2; x++) {
      if (!inArch(x, y, WINDOW_CX, top, w, h)) continue;
      const moon = Math.hypot(x - WINDOW_CX, y - 118) < 44;
      const pane = (Math.floor((x - WINDOW_CX + 200) / 14) + Math.floor(y / 18)) % 3;
      let c: number = pane === 0 ? R[0] : pane === 1 ? V[1] : V[2];
      if (moon) c = Math.hypot(x - WINDOW_CX + 10, y - 108) < 30 ? R[3] : R[2];
      else if (dither2(x, y, Math.max(0, 1 - Math.hypot(x - WINDOW_CX, y - 118) / 90) * 0.7)) c = R[1];
      // lead lines
      if ((x - WINDOW_CX + 200) % 14 === 0 || y % 18 === 0) c = PAL.ink;
      if (Math.abs(x - WINDOW_CX) < 2 && y > top + 60) c = S[0]; // central mullion
      b.set(x, y, c);
    }
  }
  // rose tracery at the top of the window
  b.ring(WINDOW_CX, top + 58, 18, 2, S[0]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.line(WINDOW_CX, top + 58, WINDOW_CX + Math.cos(a) * 18, top + 58 + Math.sin(a) * 18, S[0]);
  }
  // moonlight shaft falling to the floor
  for (let y = top + h; y < 360; y++) {
    const spread = 40 + (y - top - h) * 0.6;
    for (let x = WINDOW_CX - spread; x < WINDOW_CX + spread; x++) {
      if (dither2(x, y, 0.18 * (1 - (y - top - h) / 120))) b.set(x, y, R[0]);
    }
  }
  return b;
};

/** Far arcade: repeating gothic arches and pillars, with crimson banners. */
const drawArcade = (sf: number): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  const floor = 250 + my;
  const bay = 96;
  for (let x = 0; x < b.w; x++) {
    const bx = ((x % bay) + bay) % bay;
    for (let y = 0; y < b.h; y++) {
      const pillar = bx < 14;
      const archTop = 60 + my;
      const inside = inArch(bx, y, bay / 2 + 7, archTop, bay - 26, floor - archTop);
      // leave the center clear so the great window stays visible
      if (Math.abs(x - b.w / 2) < 100 && !pillar) continue;
      if (pillar || (!inside && y < floor)) b.set(x, y, pillar ? (bx === 13 ? V[1] : V[0]) : PAL.ink);
      else if (y >= floor) b.set(x, y, V[0]);
    }
  }
  // banners
  for (let i = 0; i < 12; i++) {
    const x = Math.round(i * bay + bay / 2 + 1);
    if (Math.abs(x - b.w / 2) < 110) continue;
    const top = 90 + my;
    b.rect(x - 7, top, 14, 70, R[1]);
    b.rect(x - 7, top, 2, 70, R[0]);
    b.rect(x + 5, top, 2, 70, R[2]);
    for (let k = 0; k < 7; k++) b.set(x - 7 + k * 2, top + 70 + (k % 2), R[0]);
    b.rect(x - 2, top + 22, 4, 8, PAL.gold[2]); // emblem
    b.set(x, top + 20, PAL.gold[3]);
  }
  return b;
};

/** Near pillars with iron sconces (torches) and a stone balustrade. */
const drawPillars = (sf: number, torches: TorchSpot[], key: string): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  const rail = 214 + my;
  for (let y = rail; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      let c: number = y === rail ? S[2] : y < rail + 3 ? S[1] : S[0];
      if (y > rail + 3 && y < rail + 26 && x % 12 >= 4 && x % 12 <= 7) c = y % 6 === 0 ? S[1] : PAL.ink; // balusters gaps
      b.set(x, y, c);
    }
  }
  for (const px of [60, b.w - 60]) {
    const x0 = px - 13;
    for (let y = 0; y < rail; y++) {
      for (let x = 0; x < 26; x++) {
        let c: number = x < 3 ? PAL.ink : x < 8 ? S[0] : x > 22 ? V[2] : S[1];
        if (x % 7 === 0 && x > 2) c = S[0]; // fluting
        b.set(x0 + x, y, c);
      }
    }
    const ty = 150 + my;
    b.rect(px - 4, ty, 9, 3, PAL.steel[1]);
    b.rect(px - 1, ty + 3, 3, 8, PAL.steel[0]);
    torches.push({ layer: key, u: px, v: ty });
  }
  return b;
};

const WORLD_X = -320;
const WORLD_Y = -260;

const drawGameplay = (): PixelBuffer => {
  const b = new PixelBuffer(640, 560);
  const at = (x: number, y: number) => [x - WORLD_X, y - WORLD_Y] as const;
  const [dais, floor, base] = THRONE_HALL.solids;
  const stone = { top: [S[3], S[4]], body: [S[0], S[1], S[2]], mortar: PAL.ink };
  {
    const [x0, y0] = at(base.x, base.y);
    paintSolid(b, x0, y0, base.w, b.h - y0, stone, 20, 10, 101);
  }
  {
    const [x0, y0] = at(floor.x, floor.y);
    paintSolid(b, x0, y0, floor.w, floor.h, stone, 20, 10, 102);
    // red carpet runner along the walkable top
    b.rect(x0 + 40, y0, floor.w - 80, 3, R[1]);
    b.rect(x0 + 40, y0, floor.w - 80, 1, R[2]);
    for (let x = x0 + 40; x < x0 + floor.w - 40; x += 4) b.set(x, y0 + 2, PAL.gold[2]);
  }
  {
    const [x0, y0] = at(dais.x, dais.y);
    paintSolid(b, x0, y0, dais.w, dais.h, { top: [R[2], R[3]], body: [R[0], R[1], R[1]], mortar: PAL.ink }, 12, 7, 103);
    b.rect(x0, y0 + dais.h - 2, dais.w, 2, PAL.gold[2]);
  }
  // iron chandeliers on chains
  for (const [i, p] of THRONE_HALL.platforms.entries()) {
    const [x0, y0] = at(p.x, p.y);
    const cx = x0 + Math.round(p.w / 2);
    for (let yy = 0; yy < y0; yy++) {
      if (yy % 4 === 0) b.set(cx, yy, PAL.steel[1]);
      else b.set(cx + (yy % 4 === 2 ? 0 : yy % 4 === 1 ? -1 : 1), yy, PAL.steel[0]);
    }
    b.line(cx, y0 - 14, x0 + 3, y0, PAL.steel[1]);
    b.line(cx, y0 - 14, x0 + p.w - 4, y0, PAL.steel[1]);
    b.rect(x0, y0, p.w, 3, PAL.steel[2]);
    b.rect(x0, y0, p.w, 1, PAL.steel[3]);
    b.rect(x0 + 2, y0 + 3, p.w - 4, 2, PAL.steel[0]);
    // candles with tiny flames
    for (let x = x0 + 4; x < x0 + p.w - 3; x += 9) {
      b.rect(x, y0 - 5, 2, 5, PAL.steel[4]);
      b.set(x, y0 - 6, PAL.fire[3]);
      b.set(x + 1, y0 - 7, hashNoise(x, i, 104) > 0.5 ? PAL.fire[4] : PAL.fire[2]);
    }
  }
  return b;
};

export const buildThroneHallArt = (): StageArt => {
  const torches: TorchSpot[] = [];
  return {
    parallax: [
      { key: 'th_sky', buf: drawSky(), sf: 0, mx: 0, my: 0, depth: -100 },
      makeLayer('th_arcade', 0.15, drawArcade(0.15), -90),
      makeLayer('th_pillars', 0.5, drawPillars(0.5, torches, 'th_pillars'), -70),
    ],
    world: { key: 'th_world', buf: drawGameplay(), x: WORLD_X, y: WORLD_Y, depth: -10 },
    torches,
    ambient: 'arcane',
  };
};
