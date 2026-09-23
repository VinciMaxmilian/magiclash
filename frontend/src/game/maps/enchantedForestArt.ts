import { ENCHANTED_FOREST } from '@magiclash/shared';
import { PixelBuffer, dither2, hashNoise } from '../render/pixelBuffer';
import { PAL } from '../render/palette';
import { smoothNoise, type StageArt } from './castleCourtyardArt';
import { gradientSky, layerBuffer, makeLayer, moon, paintSolid, ridge, stars } from './stageKit';

/**
 * ENCHANTED FOREST — noite na floresta: céu verde-azulado profundo, lua, troncos gigantes
 * em camadas e cogumelos luminosos. A rocha-raiz jogável tem o maior contraste da cena.
 */

const M = PAL.moss;
const W = PAL.wood;

const drawSky = (): PixelBuffer => {
  const b = gradientSky([PAL.sky[0], PAL.sky[1], 0x1f3328, 0x2f4f35], 280);
  stars(b, 50, 110, [PAL.sky[4], PAL.ice[3], PAL.steel[3]], 31);
  moon(b, 150, 70, 16, PAL.steel[4], PAL.steel[3], PAL.sky[2]);
  return b;
};

const drawFarTrees = (sf: number): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  ridge(b, 200 + my, 40, 70, 41, PAL.sky[1], undefined, 14);
  ridge(b, 236 + my, 30, 50, 42, M[0], undefined, 10);
  return b;
};

const drawTrunks = (sf: number): PixelBuffer => {
  const { b, mx, my } = layerBuffer(sf);
  const trunks = [-250, -150, -60, 70, 170, 260];
  trunks.forEach((tx, i) => {
    const cx = Math.round(b.w / 2 + tx + (hashNoise(i, 0, 51) - 0.5) * 30);
    const w = 22 + Math.round(hashNoise(i, 1, 51) * 16);
    for (let y = 0; y < b.h; y++) {
      const wob = Math.round(Math.sin(y / 23 + i) * 2);
      for (let x = 0; x < w; x++) {
        const t = x / w;
        let c: number = t < 0.25 ? W[0] : t > 0.8 ? W[1] : hashNoise(Math.floor(x / 3), Math.floor(y / 7), i) > 0.7 ? W[0] : 0x2a2733;
        if (t > 0.88 && dither2(x, y, 0.5)) c = M[1]; // moonlit moss on the right side
        b.set(cx - w / 2 + x + wob, y, c);
      }
    }
    // roots flaring at the base
    const base = 270 + my;
    for (let r = 0; r < 14; r++) {
      const spread = r * 1.4;
      b.rect(cx - w / 2 - spread, base + r, w + spread * 2, 1, r % 3 === 0 ? W[0] : 0x2a2733);
    }
    // glowing mushrooms
    for (let k = 0; k < 3; k++) {
      const mxp = cx - w / 2 - 4 + k * (w / 2 + 3);
      const myp = base + 6 + (k % 2) * 3;
      const col = k === 1 ? PAL.ice : PAL.lightning;
      b.rect(mxp - 2, myp - 2, 5, 2, col[2]);
      b.rect(mxp - 1, myp - 3, 3, 1, col[3]);
      b.rect(mxp, myp, 1, 3, PAL.steel[3]);
      for (let yy = -8; yy <= 6; yy++) {
        for (let xx = -8; xx <= 8; xx++) {
          if (Math.hypot(xx, yy) < 8 && dither2(mxp + xx, myp + yy, 0.18) && b.alphaAt(mxp + xx, myp + yy) && b.colorAt(mxp + xx, myp + yy) !== col[2]) {
            b.set(mxp + xx, myp + yy, M[1]);
          }
        }
      }
    }
    // hanging vines
    for (let v = 0; v < 4; v++) {
      const vx = cx - w / 2 + v * 7;
      const len = 30 + Math.round(hashNoise(v, i, 61) * 60);
      for (let y = 0; y < len; y++) b.set(vx + Math.round(Math.sin(y / 6 + v) * 1.5), y, y % 5 === 0 ? M[3] : M[2]);
    }
  });
  // forest floor far below (dark)
  for (let y = 284 + my; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) b.set(x, y, dither2(x, y, (y - 284 - my) / 40) ? PAL.ink : M[0]);
  }
  void mx;
  return b;
};

const WORLD_X = -260;
const WORLD_Y = -220;

const drawGameplay = (): PixelBuffer => {
  const b = new PixelBuffer(520, 520);
  const at = (x: number, y: number) => [x - WORLD_X, y - WORLD_Y] as const;
  const [main, base] = ENCHANTED_FOREST.solids;

  // underside roots
  const [ux, uy] = at(base.x, base.y + base.h);
  for (let i = 0; i < 18; i++) {
    const rx = ux + 8 + i * 14 + Math.round(hashNoise(i, 0, 71) * 6);
    const len = 14 + Math.round(hashNoise(i, 1, 71) * 40);
    for (let y = 0; y < len; y++) {
      const x = rx + Math.round(Math.sin(y / 5 + i) * 2);
      b.rect(x, uy + y, y < len / 2 ? 3 : 2, 1, y % 4 === 0 ? W[1] : W[0]);
    }
  }
  // lower rock body: dark stone with moss drips
  {
    const [x0, y0] = at(base.x, base.y);
    for (let y = 0; y < base.h; y++) {
      for (let x = 0; x < base.w; x++) {
        const n = hashNoise(Math.floor(x / 6), Math.floor(y / 5), 73);
        let c: number = n > 0.7 ? PAL.stone[2] : n > 0.35 ? PAL.stone[1] : PAL.stone[0];
        if (x < 2) c = PAL.stone[0];
        if (x >= base.w - 2) c = PAL.stone[3];
        if (y < 18 && hashNoise(x, 0, 74) * 18 > y) c = M[1];
        b.set(x0 + x, y0 + y, c);
      }
    }
  }
  // main mossy rock
  {
    const [x0, y0] = at(main.x, main.y);
    paintSolid(b, x0, y0, main.w, main.h, { top: [M[1], M[2], M[3]], body: PAL.stone, mortar: PAL.stone[0] }, 16, 8, 75);
    // grass lip + moss hanging over the front
    for (let x = 0; x < main.w; x++) {
      const drip = Math.round(smoothNoise(x / 4, 76) * 6);
      for (let y = 4; y < 5 + drip; y++) b.set(x0 + x, y0 + y, y === 4 + drip ? M[1] : M[2]);
      if (hashNoise(x, 1, 77) > 0.8) b.set(x0 + x, y0 - 1, M[3]);
    }
    // flowers
    for (let i = 0; i < 7; i++) {
      const fx = x0 + 12 + Math.floor(hashNoise(i, 3, 78) * (main.w - 24));
      b.set(fx, y0 - 1, i % 2 ? PAL.ice[3] : PAL.sky[4]);
    }
  }
  // branches (one-way)
  ENCHANTED_FOREST.platforms.forEach((p, i) => {
    const [x0, y0] = at(p.x, p.y);
    const fromLeft = p.x < 0;
    for (let x = 0; x < p.w; x++) {
      b.set(x0 + x, y0, W[3]);
      b.set(x0 + x, y0 + 1, W[2]);
      b.set(x0 + x, y0 + 2, x % 9 === 0 ? W[0] : W[1]);
      b.set(x0 + x, y0 + 3, W[0]);
    }
    // branch continues off toward the trunk side
    const dir = i === 2 ? 0 : fromLeft ? -1 : 1;
    if (dir !== 0) {
      const sx = fromLeft ? x0 : x0 + p.w - 1;
      for (let k = 0; k < 40; k++) b.rect(sx + dir * k, y0 + Math.floor(k / 6), 1, 5 - Math.floor(k / 12), W[1]);
    } else {
      // center: hanging vines hold a wooden plank
      for (const vx of [x0 + 6, x0 + p.w - 7]) for (let y = 0; y < y0; y++) b.set(vx + Math.round(Math.sin(y / 7) * 1), y, y % 5 ? M[1] : M[2]);
    }
    // leaf tufts
    for (let k = 0; k < p.w; k += 10) {
      b.rect(x0 + k + 2, y0 - 2, 4, 2, M[2]);
      b.set(x0 + k + 3, y0 - 3, M[3]);
    }
  });
  return b;
};

const drawForeground = (sf: number): PixelBuffer => {
  const { b, mx, my } = layerBuffer(sf);
  // leafy canopy framing the top corners
  for (const side of [0, 1]) {
    for (let i = 0; i < 90; i++) {
      const x = side ? b.w - mx - 30 + Math.floor(hashNoise(i, 1, 81) * 110) : mx - 80 + Math.floor(hashNoise(i, 1, 82) * 110);
      const y = Math.floor(hashNoise(i, 2, 83 + side) * (my + 30));
      b.disc(x, y, 3 + hashNoise(i, 3, 84) * 3, i % 3 ? M[0] : M[1]);
    }
  }
  return b;
};

export const buildEnchantedForestArt = (): StageArt => ({
  parallax: [
    { key: 'ef_sky', buf: drawSky(), sf: 0, mx: 0, my: 0, depth: -100 },
    makeLayer('ef_far', 0.15, drawFarTrees(0.15), -90),
    makeLayer('ef_trunks', 0.45, drawTrunks(0.45), -70),
    makeLayer('ef_front', 1.25, drawForeground(1.25), 100),
  ],
  world: { key: 'ef_world', buf: drawGameplay(), x: WORLD_X, y: WORLD_Y, depth: -10 },
  torches: [],
  ambient: 'fireflies',
});
