import { WIZARD_TOWER } from '@magiclash/shared';
import { PixelBuffer, dither2, hashNoise } from '../render/pixelBuffer';
import { PAL } from '../render/palette';
import { type StageArt, type TorchSpot } from './castleCourtyardArt';
import { gradientSky, layerBuffer, makeLayer, moon, paintSolid, ridge, stars } from './stageKit';

/**
 * WIZARD TOWER — topo de uma torre arcana acima das nuvens. Céu violeta com duas luas, torres
 * distantes com janelas acesas, anel rúnico atrás do palco. As runas das plataformas brilham em
 * lilás (a mesma cor da magia de raio), e o chão jogável é a pedra mais clara da cena.
 */

const L = PAL.lightning;
const S = PAL.stone;

const drawSky = (): PixelBuffer => {
  const b = gradientSky([PAL.sky[0], PAL.sky[1], L[0], PAL.sky[2]], 300);
  stars(b, 90, 200, [PAL.steel[4], L[3], PAL.sky[4], L[2]], 71);
  moon(b, 470, 64, 20, PAL.steel[4], PAL.steel[3], PAL.sky[2]);
  moon(b, 540, 104, 6, L[3], L[2], L[0]);
  return b;
};

/** Distant spires: thin towers with conical roofs and a few lit windows. */
const drawSpires = (sf: number): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  ridge(b, 250 + my, 18, 80, 72, PAL.sky[1]); // cloud bank the spires stand on
  for (let i = 0; i < 9; i++) {
    const cx = Math.round((i + 0.5) * (b.w / 9) + (hashNoise(i, 0, 73) - 0.5) * 40);
    const w = 10 + Math.round(hashNoise(i, 1, 73) * 10);
    const top = 120 + my + Math.round(hashNoise(i, 2, 73) * 90);
    b.rect(cx - w / 2, top, w, b.h - top, PAL.sky[1]);
    b.rect(cx + w / 2 - 2, top, 2, b.h - top, L[0]); // rim light from the moons
    const roof = Math.round(w * 1.4);
    for (let y = 0; y < roof; y++) {
      const half = Math.max(0, Math.round((w / 2 + 2) * (y / roof)));
      b.rect(cx - half, top - roof + y, half * 2 + 1, 1, y < 2 ? L[1] : PAL.sky[0]);
    }
    for (let k = 0; k < 3; k++) {
      if (hashNoise(i, k + 3, 74) > 0.45) b.rect(cx - 1, top + 10 + k * 16, 2, 3, PAL.gold[3]);
    }
  }
  // cloud tops (dithered edge)
  for (let x = 0; x < b.w; x++) {
    for (let y = 244 + my; y < 262 + my; y++) if (dither2(x, y, 0.3)) b.set(x, y, PAL.sky[2]);
  }
  return b;
};

/** Parapet of the tower top with arched windows, a big rune circle and two braziers. */
const drawParapet = (sf: number, torches: TorchSpot[], key: string): PixelBuffer => {
  const { b, my } = layerBuffer(sf);
  const cx = Math.round(b.w / 2);
  const cy = 150 + my;
  // rune circle (behind everything else on this layer)
  b.ring(cx, cy, 70, 2, L[1]);
  b.ring(cx, cy, 58, 1, L[0]);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * 64);
    const y = Math.round(cy + Math.sin(a) * 64);
    b.rect(x - 1, y - 2, 3, 5, k % 3 === 0 ? L[3] : L[2]);
    b.set(x, y - 1, L[4]);
  }
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2;
    const a1 = ((k + 2) / 6) * Math.PI * 2;
    b.line(Math.round(cx + Math.cos(a0) * 58), Math.round(cy + Math.sin(a0) * 58), Math.round(cx + Math.cos(a1) * 58), Math.round(cy + Math.sin(a1) * 58), L[0]);
  }
  // wall with arches
  const top = 196 + my;
  for (let y = top; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const row = Math.floor((y - top) / 9);
      const bx = (x + (row % 2) * 8) % 16;
      let c: number = S[1];
      if (bx === 0 || (y - top) % 9 === 0) c = S[0];
      else if ((y - top) % 9 === 1) c = S[2];
      b.set(x, y, c);
    }
  }
  for (let x = 0; x < b.w; x += 20) {
    b.rect(x, top - 10, 12, 10, S[1]);
    b.rect(x, top - 10, 12, 1, S[3]);
  }
  b.rect(0, top, b.w, 1, S[3]);
  for (let ax = 30; ax < b.w - 20; ax += 64) {
    const aw = 18;
    const ay = top + 20;
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < aw; x++) {
        const dx = x - aw / 2 + 0.5;
        const inside = y > aw / 2 || Math.hypot(dx, y - aw / 2) < aw / 2;
        if (!inside) continue;
        const glow = y > 26 ? 0 : 1 - y / 26;
        b.set(ax + x, ay + y, dither2(ax + x, ay + y, glow * 0.6) ? L[1] : PAL.sky[0]);
      }
    }
  }
  for (const tx of [cx - 150, cx + 150]) {
    const ty = top + 8;
    b.rect(tx - 4, ty, 9, 3, S[3]);
    b.rect(tx - 2, ty + 3, 5, 10, S[2]);
    torches.push({ layer: key, u: tx, v: ty });
  }
  return b;
};

const WORLD_X = -260;
const WORLD_Y = -260;

/** Small glyph (3×5) used on the stone: deterministic per position. */
const rune = (b: PixelBuffer, x: number, y: number, seed: number, color: number) => {
  for (let yy = 0; yy < 5; yy++) {
    for (let xx = 0; xx < 3; xx++) {
      if (xx === 1 || hashNoise(xx, yy, seed) > 0.5) b.set(x + xx, y + yy, color);
    }
  }
};

const drawGameplay = (): PixelBuffer => {
  const b = new PixelBuffer(520, 580);
  const at = (x: number, y: number) => [x - WORLD_X, y - WORLD_Y] as const;
  const [top, shaft] = WIZARD_TOWER.solids;

  // tower shaft continues to the bottom of the view
  {
    const [x0, y0] = at(shaft.x, shaft.y);
    const h = b.h - y0;
    paintSolid(b, x0, y0, shaft.w, h, { top: [S[2], S[3]], body: [S[0], S[1], S[2]], mortar: PAL.sky[0] }, 16, 9, 75);
    for (let wy = y0 + 30; wy < b.h - 20; wy += 56) {
      for (const wx of [x0 + 30, x0 + shaft.w - 42]) {
        b.rect(wx, wy, 12, 18, PAL.sky[0]);
        b.rect(wx + 2, wy + 4, 8, 12, L[1]);
        b.rect(wx + 2, wy + 4, 8, 2, L[3]);
      }
    }
  }
  // tower top: pale stone with a band of runes
  {
    const [x0, y0] = at(top.x, top.y);
    paintSolid(b, x0, y0, top.w, top.h, { top: [S[3], S[4]], body: [S[1], S[2], S[3]], mortar: S[0] }, 18, 9, 76);
    b.rect(x0 + 6, y0 + 16, top.w - 12, 9, PAL.sky[0]);
    for (let x = 10; x < top.w - 12; x += 7) rune(b, x0 + x, y0 + 18, 77 + x, hashNoise(x, 0, 78) > 0.7 ? L[4] : L[2]);
    // corbels under the overhang
    for (let x = 0; x < top.w; x += 16) b.rect(x0 + x + 2, y0 + top.h, 8, 4, S[1]);
  }
  // floating rune slabs with a glowing underside
  for (const [i, p] of WIZARD_TOWER.platforms.entries()) {
    const [x0, y0] = at(p.x, p.y);
    for (let x = 0; x < p.w; x++) {
      b.set(x0 + x, y0, S[4]);
      b.set(x0 + x, y0 + 1, S[3]);
      b.set(x0 + x, y0 + 2, S[2]);
      b.set(x0 + x, y0 + 3, x % 9 === 4 ? L[3] : S[1]);
      b.set(x0 + x, y0 + 4, S[0]);
    }
    const inset = 4;
    for (let x = inset; x < p.w - inset; x++) {
      for (let y = 5; y < 12; y++) {
        const k = 1 - (y - 5) / 7;
        const edge = Math.min(x - inset, p.w - inset - 1 - x) / 6;
        if (dither2(x0 + x, y0 + y, k * Math.min(1, edge) * 0.8)) b.set(x0 + x, y0 + y, y < 7 ? L[2] : L[1]);
      }
    }
    rune(b, x0 + Math.round(p.w / 2) - 1, y0 + 6, 80 + i, L[4]);
  }
  return b;
};

export const buildWizardTowerArt = (): StageArt => {
  const torches: TorchSpot[] = [];
  return {
    parallax: [
      { key: 'wt_sky', buf: drawSky(), sf: 0, mx: 0, my: 0, depth: -100 },
      makeLayer('wt_spires', 0.15, drawSpires(0.15), -90),
      makeLayer('wt_parapet', 0.5, drawParapet(0.5, torches, 'wt_parapet'), -70),
    ],
    world: { key: 'wt_world', buf: drawGameplay(), x: WORLD_X, y: WORLD_Y, depth: -10 },
    torches,
    ambient: 'arcane',
  };
};
