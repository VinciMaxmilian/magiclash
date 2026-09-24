import { CASTLE_COURTYARD } from '@magiclash/shared';
import { PixelBuffer, dither2, hashNoise } from '../render/pixelBuffer';
import { PAL } from '../render/palette';

/**
 * CASTLE COURTYARD — procedural placeholder art (docs/ASSETS.md).
 *
 * Value hierarchy: far layers are desaturated and pulled toward the dusk sky; the playable
 * stone/wood platforms carry the strongest contrast so the gameplay silhouette reads first.
 * Light comes from the low sun on the right (warm rims), torches add local warm pools.
 */

export const VIEW_W = 640;
export const VIEW_H = 360;
/** Camera center used when authoring parallax layers ("reference view"). */
export const REF_CENTER = { x: 0, y: -60 };
const PAN_X = 110;
const PAN_Y = 90;

export interface ParallaxLayer {
  key: string;
  buf: PixelBuffer;
  sf: number;
  mx: number;
  my: number;
  depth: number;
}

export interface WorldLayer {
  key: string;
  buf: PixelBuffer;
  x: number;
  y: number;
  depth: number;
}

export interface TorchSpot {
  layer: string;
  u: number;
  v: number;
}

export interface StageArt {
  parallax: ParallaxLayer[];
  world: WorldLayer;
  torches: TorchSpot[];
  /** Ambient particles drawn by StageView. */
  ambient: 'embers' | 'fireflies' | 'snow' | 'arcane' | 'dust';
}

export const margins = (sf: number) => ({ mx: Math.ceil(PAN_X * sf) + 8, my: Math.ceil(PAN_Y * sf) + 8 });

export const smoothNoise = (x: number, seed: number): number => {
  const i = Math.floor(x);
  const f = x - i;
  const a = hashNoise(i, 0, seed);
  const b = hashNoise(i + 1, 0, seed);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
};

// ── Sky ─────────────────────────────────────────────────────────────────────

const drawSky = (): PixelBuffer => {
  const b = new PixelBuffer(VIEW_W, VIEW_H);
  const K = PAL.sky;
  const horizon = 262;
  for (let y = 0; y < VIEW_H; y++) {
    const idx = 1 + Math.min(1, y / horizon) * 5;
    const band = Math.floor(idx);
    const frac = idx - band;
    for (let x = 0; x < VIEW_W; x++) {
      let c = K[Math.min(band, 6)];
      if (frac > 0.65 && band < 6 && dither2(x, y, (frac - 0.65) / 0.35)) c = K[band + 1];
      b.set(x, y, c);
    }
  }
  // stars in the darkest band
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(hashNoise(i, 1, 7) * VIEW_W);
    const y = Math.floor(hashNoise(i, 2, 7) * 60);
    b.set(x, y, i % 5 === 0 ? K[6] : K[4]);
  }
  // low sun with a stepped halo
  const sx = 500;
  const sy = 96;
  b.disc(sx, sy, 30, K[5]);
  for (let y = -30; y <= 30; y++) {
    for (let x = -30; x <= 30; x++) {
      const d = Math.hypot(x, y);
      if (d > 26 && d <= 30 && !dither2(sx + x, sy + y, 0.5)) b.set(sx + x, sy + y, K[4]);
    }
  }
  b.disc(sx, sy, 20, K[6]);
  b.disc(sx, sy, 16, PAL.fire[4]);
  // clouds: flat-bottomed, lit from the sun side (right)
  const clouds = [
    { x: 90, y: 80, w: 90 },
    { x: 250, y: 50, w: 60 },
    { x: 330, y: 104, w: 80 },
    { x: 560, y: 70, w: 70 },
    { x: 180, y: 160, w: 80 },
  ];
  clouds.forEach((c, ci) => {
    const lumps = Math.max(3, Math.floor(c.w / 16));
    for (let i = 0; i < lumps; i++) {
      const t = i / (lumps - 1);
      const r = 5 + Math.sin(t * Math.PI) * 7 + hashNoise(i, ci, 3) * 3;
      const cx = c.x + t * c.w;
      b.disc(cx, c.y - r * 0.4, r, K[3]);
      b.disc(cx + 1, c.y - r * 0.4 - 1, r - 1.5, K[4]);
      b.disc(cx + 2, c.y - r * 0.4 - 2, r - 4, K[5]);
    }
    // cut a flat base
    for (let x = c.x - 20; x < c.x + c.w + 20; x++) {
      for (let y = c.y + 1; y < c.y + 20; y++) {
        const idx = 1 + Math.min(1, y / horizon) * 5;
        const band = Math.floor(idx);
        const frac = idx - band;
        let col: number = K[Math.min(band, 6)];
        if (frac > 0.65 && band < 6 && dither2(x, y, (frac - 0.65) / 0.35)) col = K[band + 1];
        const cur = b.colorAt(Math.max(0, x), y);
        if (cur === K[3] || cur === K[4] || cur === K[5]) b.set(x, y, col);
      }
    }
  });
  return b;
};

// ── Mountains ───────────────────────────────────────────────────────────────

const drawMountains = (sf: number): PixelBuffer => {
  const { mx, my } = margins(sf);
  const w = VIEW_W + mx * 2;
  const h = VIEW_H + my * 2;
  const b = new PixelBuffer(w, h);
  const K = PAL.sky;
  const ranges = [
    { base: 150, amp: 52, freq: 95, seed: 11, col: K[3], snow: 0, shade: K[2] },
    { base: 168, amp: 34, freq: 60, seed: 12, col: K[2], snow: 0, shade: K[1] },
  ];
  for (const r of ranges) {
    for (let x = 0; x < w; x++) {
      const n = smoothNoise(x / r.freq, r.seed) * 0.7 + smoothNoise(x / (r.freq / 3), r.seed + 1) * 0.3;
      const ridge = Math.round(r.base + my - n * r.amp);
      // slope-based shading: the side facing the sun (right) is lit
      const nNext = smoothNoise((x + 1) / r.freq, r.seed) * 0.7 + smoothNoise((x + 1) / (r.freq / 3), r.seed + 1) * 0.3;
      const facingSun = nNext < n;
      for (let y = ridge; y < h; y++) {
        let c: number = r.col;
        if (!facingSun && y < ridge + 40) c = r.shade;
        if (r.snow && y < ridge + 4 && ridge < r.base + my - r.amp * 0.55) c = r.snow;
        b.set(x, y, c);
      }
    }
  }
  return b;
};

// ── Distant castle ──────────────────────────────────────────────────────────

const drawCastle = (sf: number): PixelBuffer => {
  const { mx, my } = margins(sf);
  const w = VIEW_W + mx * 2;
  const h = VIEW_H + my * 2;
  const b = new PixelBuffer(w, h);
  const K = PAL.sky;
  const body = PAL.stone[2];
  const shade = PAL.stone[1];
  const cx = Math.round(w / 2) - 40;
  const groundY = 236 + my;

  // hill
  for (let x = 0; x < w; x++) {
    const hy = groundY - Math.round(Math.max(0, 26 - Math.abs(x - cx) * 0.12)) - Math.round(smoothNoise(x / 20, 4) * 4);
    for (let y = hy; y < h; y++) b.set(x, y, K[1]);
  }
  const tower = (x: number, width: number, height: number, roof: number) => {
    const top = groundY - 20 - height;
    b.rect(x, top, width, height + 20, body);
    b.rect(x, top, 2, height + 20, shade);
    for (let i = 0; i <= roof; i++) {
      const half = Math.round((width / 2 + 2) * (i / roof));
      b.rect(x + width / 2 - half, top - roof + i, half * 2, 1, K[1]);
    }
    b.rect(x + width / 2, top - roof - 6, 1, 6, K[1]);
    b.rect(x + width / 2 + 1, top - roof - 6, 4, 2, PAL.gold[1]);
    for (let wy = top + 12; wy < groundY - 26; wy += 16) b.rect(x + width / 2 - 1, wy, 2, 3, PAL.fire[3]);
  };
  // curtain walls
  b.rect(cx - 170, groundY - 58, 340, 40, body);
  for (let x = cx - 170; x < cx + 170; x += 8) b.rect(x, groundY - 62, 5, 4, body);
  // keep
  b.rect(cx - 40, groundY - 120, 80, 102, body);
  b.rect(cx - 40, groundY - 120, 3, 102, shade);
  for (let x = cx - 40; x < cx + 40; x += 8) b.rect(x, groundY - 125, 5, 5, body);
  for (let wy = groundY - 104; wy < groundY - 40; wy += 18) {
    for (let wx = cx - 26; wx < cx + 30; wx += 16) b.rect(wx, wy, 2, 4, PAL.fire[3]);
  }
  tower(cx - 180, 22, 90, 22);
  tower(cx + 158, 22, 100, 24);
  tower(cx - 70, 18, 120, 20);
  tower(cx + 52, 18, 130, 22);
  return b;
};

// ── Courtyard wall (mid layer) ──────────────────────────────────────────────

const drawCourtyardWall = (sf: number, torches: TorchSpot[], key: string): PixelBuffer => {
  const { mx, my } = margins(sf);
  const w = VIEW_W + mx * 2;
  const h = VIEW_H + my * 2;
  const b = new PixelBuffer(w, h);
  const S = PAL.stone;
  const top = 150 + my;
  const floor = 286 + my;

  // abyss below the ramparts: mist fading into darkness
  for (let y = floor; y < h; y++) {
    const t = (y - floor) / (h - floor);
    for (let x = 0; x < w; x++) {
      const c = t < 0.3 ? (dither2(x, y, t / 0.3) ? S[0] : PAL.sky[1]) : S[0];
      b.set(x, y, c);
    }
  }
  // wall body with offset masonry
  for (let y = top; y < floor; y++) {
    for (let x = 0; x < w; x++) {
      const row = Math.floor((y - top) / 8);
      const bx = (x + (row % 2) * 8) % 16;
      let c: number = S[1];
      if (bx === 0 || (y - top) % 8 === 0) c = S[0];
      else if ((y - top) % 8 === 1 && hashNoise(Math.floor((x + (row % 2) * 8) / 16), row, 5) > 0.7) c = S[2];
      else if (hashNoise(x, y, 9) > 0.99) c = S[0];
      b.set(x, y, c);
    }
  }
  // merlons
  for (let x = 0; x < w; x += 20) {
    b.rect(x, top - 10, 12, 10, S[1]);
    b.rect(x, top - 10, 12, 1, PAL.sky[3]);
    b.rect(x + 11, top - 10, 1, 10, PAL.sky[3]); // warm sun-side rim
  }
  b.rect(0, top, w, 1, PAL.sky[3]);

  // towers
  const towerAt = (x: number) => {
    const tt = top - 60;
    b.rect(x, tt, 64, floor - tt, S[1]);
    for (let y = tt; y < floor; y += 8) b.rect(x, y, 64, 1, S[0]);
    b.rect(x + 62, tt, 2, floor - tt, S[2]);
    b.rect(x, tt, 3, floor - tt, S[0]);
    for (let i = 0; i < 5; i++) b.rect(x + 2 + i * 13, tt - 8, 8, 8, S[1]);
    b.rect(x + 29, tt + 24, 4, 14, PAL.ink);
    b.rect(x + 29, tt + 60, 4, 14, PAL.ink);
    b.set(x + 30, tt + 25, PAL.fire[2]);
  };
  towerAt(mx + 30);
  towerAt(mx + VIEW_W - 94);

  // central gate with portcullis
  const gx = Math.round(w / 2) - 36;
  const gTop = floor - 78;
  for (let y = gTop; y < floor; y++) {
    for (let x = gx; x < gx + 72; x++) {
      const dx = x - (gx + 36);
      const archY = gTop + 30 - Math.sqrt(Math.max(0, 36 * 36 - dx * dx)) * 0.85;
      if (y < archY) continue;
      b.set(x, y, S[0]);
      if ((x - gx) % 8 === 3 || (y - gTop) % 9 === 0) b.set(x, y, PAL.steel[0]);
    }
  }
  // banners (neutral royal purple, gold trim)
  for (const bxp of [Math.round(w / 2) - 130, Math.round(w / 2) + 116]) {
    b.rect(bxp, top + 4, 16, 44, PAL.sky[1]);
    b.rect(bxp + 2, top + 4, 12, 44, PAL.sky[2]);
    b.rect(bxp, top + 4, 16, 2, PAL.gold[2]);
    for (let i = 0; i < 8; i++) {
      b.set(bxp + i, top + 48 + i, PAL.sky[2]);
      b.set(bxp + 15 - i, top + 48 + i, PAL.sky[2]);
      if (i < 7) b.rect(bxp + i + 1, top + 48 + i, 14 - i * 2, 1, PAL.sky[1]);
    }
    b.stamp(bxp + 4, top + 16, ['..#..', '.###.', '#####', '..#..', '.###.'], { '#': PAL.gold[2] });
  }
  // torches: warm light pools + iron sconces; flames are animated sprites
  for (const tx of [Math.round(w / 2) - 180, Math.round(w / 2) - 72, Math.round(w / 2) + 72, Math.round(w / 2) + 180]) {
    const ty = top + 62;
    for (let y = -22; y <= 22; y++) {
      for (let x = -22; x <= 22; x++) {
        const d = Math.hypot(x, y * 1.2);
        const px = tx + x;
        const py = ty + y;
        if (d > 22 || py < top) continue;
        const cur = b.colorAt(px, py);
        const lit = cur === S[1] ? PAL.gold[0] : cur === S[0] ? PAL.leather[0] : cur === S[2] ? PAL.gold[1] : cur;
        if (d < 5 || dither2(px, py, Math.max(0, 1 - (d - 5) / 12) * 0.75)) b.set(px, py, lit);
      }
    }
    b.rect(tx - 1, ty, 3, 6, PAL.wood[1]);
    b.rect(tx - 2, ty - 1, 5, 2, PAL.steel[0]);
    torches.push({ layer: key, u: tx, v: ty - 1 });
  }
  return b;
};

// ── Playable geometry (world space, scroll factor 1) ────────────────────────

const WORLD_X = -260;
const WORLD_Y = -220;

const drawGameplay = (): PixelBuffer => {
  const b = new PixelBuffer(520, 520);
  const S = PAL.stone;
  const Wd = PAL.wood;
  const at = (x: number, y: number) => [x - WORLD_X, y - WORLD_Y] as const;
  const [main, base] = CASTLE_COURTYARD.solids;

  // chains holding the floating platforms
  const chain = (x: number, fromY: number) => {
    const [cx, cy] = at(x, fromY);
    for (let y = 0; y < cy; y++) {
      const link = y % 4;
      if (link === 0) b.set(cx, y, PAL.steel[1]);
      else if (link === 1 || link === 3) {
        b.set(cx - 1, y, PAL.steel[0]);
        b.set(cx + 1, y, PAL.steel[1]);
      } else b.set(cx, y, PAL.steel[0]);
    }
  };
  for (const p of CASTLE_COURTYARD.platforms) {
    chain(p.x + 6, p.y);
    chain(p.x + p.w - 7, p.y);
  }

  // underside: tapered rock + hanging roots (not collidable, kept dark)
  for (let y = base.y + base.h; y < base.y + base.h + 60; y++) {
    const t = (y - (base.y + base.h)) / 60;
    const half = Math.round((base.w / 2) * (1 - t) * (0.85 + smoothNoise(y / 6, 3) * 0.15));
    const [x0, yy] = at(-half, y);
    for (let x = 0; x < half * 2; x++) {
      const n = hashNoise(x, y, 21);
      b.set(x0 + x, yy, n > 0.8 ? S[1] : S[0]);
    }
  }
  for (let i = 0; i < 14; i++) {
    const rx = -130 + i * 20 + Math.round(hashNoise(i, 0, 31) * 8);
    const len = 8 + Math.round(hashNoise(i, 1, 31) * 22);
    const [px, py] = at(rx, base.y + base.h);
    for (let y = 0; y < len; y++) b.set(px + Math.round(Math.sin(y / 4 + i) * 1), py + y, y > len - 3 ? PAL.moss[1] : PAL.moss[0]);
  }

  // lower base: masonry with dark arches
  {
    const [x0, y0] = at(base.x, base.y);
    for (let y = 0; y < base.h; y++) {
      for (let x = 0; x < base.w; x++) {
        const row = Math.floor(y / 8);
        const bx = (x + (row % 2) * 6) % 12;
        let c: number = S[2];
        if (bx === 0 || y % 8 === 0) c = S[1];
        else if (y % 8 === 1) c = S[3];
        if (x < 2) c = S[1];
        if (x >= base.w - 2) c = S[3];
        b.set(x0 + x, y0 + y, c);
      }
    }
    for (let i = 0; i < 4; i++) {
      const ax = x0 + 26 + i * 70;
      for (let y = 18; y < base.h - 10; y++) {
        for (let x = 0; x < 36; x++) {
          const dx = x - 18;
          if (y < 18 + 18 - Math.sqrt(Math.max(0, 18 * 18 - dx * dx))) continue;
          b.set(ax + x, y0 + y, y < 22 ? S[1] : S[0]);
        }
      }
    }
  }

  // main platform: cobbled walkway + big blocks
  {
    const [x0, y0] = at(main.x, main.y);
    for (let y = 0; y < main.h; y++) {
      for (let x = 0; x < main.w; x++) {
        let c: number;
        if (y === 0) c = S[4];
        else if (y < 4) c = hashNoise(Math.floor(x / 5), y, 41) > 0.6 ? S[4] : S[3];
        else if (y === 4) c = S[1];
        else {
          const row = Math.floor((y - 5) / 9);
          const bx = (x + (row % 2) * 10) % 20;
          c = S[2];
          if (bx === 0 || (y - 5) % 9 === 0) c = S[1];
          else if ((y - 5) % 9 === 1) c = S[3];
          else if (hashNoise(x, y, 43) > 0.97) c = S[1];
        }
        if (x === 0 || x === main.w - 1) c = y === 0 ? S[4] : S[1];
        b.set(x0 + x, y0 + y, c);
      }
    }
    // cobble gaps on top surface
    for (let x = 3; x < main.w - 3; x += 5 + Math.floor(hashNoise(x, 0, 45) * 3)) b.set(x0 + x, y0 + 2, S[2]);
    // moss on the edges and tufts (tiny, below eye line of fighters)
    for (const edge of [0, main.w - 1]) {
      for (let y = 1; y < 22; y++) {
        if (hashNoise(edge, y, 47) > 0.45) b.set(x0 + edge, y0 + y, PAL.moss[2]);
      }
    }
    for (let i = 0; i < 9; i++) {
      const tx = x0 + 10 + Math.floor(hashNoise(i, 2, 49) * (main.w - 20));
      b.set(tx, y0 - 1, PAL.moss[3]);
      b.set(tx + 1, y0 - 1, PAL.moss[2]);
      b.set(tx - 1, y0, PAL.moss[2]);
    }
  }

  // floating platforms: wooden walkways (sides) and a stone balcony (center)
  CASTLE_COURTYARD.platforms.forEach((p, i) => {
    const [x0, y0] = at(p.x, p.y);
    const stone = i === 2;
    if (stone) {
      for (let x = 0; x < p.w; x++) {
        b.set(x0 + x, y0, S[4]);
        b.rect(x0 + x, y0 + 1, 1, 4, x % 12 === 0 ? S[1] : S[3]);
        b.set(x0 + x, y0 + 5, S[1]);
      }
      for (let k = 0; k < 3; k++) {
        const cx = x0 + 12 + k * ((p.w - 24) / 2);
        for (let y = 0; y < 6; y++) b.rect(cx - (5 - y), y0 + 6 + y, (5 - y) * 2, 1, y === 0 ? S[2] : S[1]);
      }
    } else {
      for (let x = 0; x < p.w; x++) {
        const seam = x % 11 === 0;
        b.set(x0 + x, y0, Wd[3]);
        b.set(x0 + x, y0 + 1, seam ? Wd[1] : Wd[2]);
        b.set(x0 + x, y0 + 2, seam ? Wd[1] : Wd[2]);
        b.set(x0 + x, y0 + 3, Wd[1]);
        if (x % 11 === 5) b.set(x0 + x, y0 + 1, PAL.steel[2]); // nail
      }
      // cross beams underneath
      for (const bx of [8, p.w - 9]) {
        for (let y = 0; y < 8; y++) {
          b.set(x0 + bx - 4 + y, y0 + 4 + y, Wd[0]);
          b.set(x0 + bx + 4 - y, y0 + 4 + y, Wd[1]);
        }
      }
      b.rect(x0 + 2, y0 + 4, p.w - 4, 1, Wd[0]);
    }
  });
  return b;
};

// ── Foreground framing (kept to screen corners, never over the arena) ──────

const drawForeground = (sf: number): PixelBuffer => {
  const { mx, my } = margins(sf);
  const w = VIEW_W + mx * 2;
  const h = VIEW_H + my * 2;
  const b = new PixelBuffer(w, h);
  const M = PAL.moss;
  const vine = (x: number, len: number, seed: number) => {
    for (let y = 0; y < len; y++) {
      const vx = x + Math.round(Math.sin(y / 7 + seed) * 2);
      b.set(vx, y, M[0]);
      if (y % 5 === seed % 5) {
        b.set(vx + 1, y, M[1]);
        b.set(vx + 2, y + 1, M[1]);
        b.set(vx - 1, y + 1, M[2]);
      }
    }
  };
  for (let i = 0; i < 7; i++) vine(mx - 20 + i * 9, my + 18 + Math.round(hashNoise(i, 0, 51) * 40), i);
  for (let i = 0; i < 7; i++) vine(w - mx + 20 - i * 9, my + 18 + Math.round(hashNoise(i, 1, 51) * 40), i + 3);
  return b;
};

export const buildCastleCourtyardArt = (): StageArt => {
  const torches: TorchSpot[] = [];
  const layer = (key: string, sf: number, buf: PixelBuffer, depth: number): ParallaxLayer => ({
    key,
    buf,
    sf,
    ...margins(sf),
    depth,
  });
  const parallax: ParallaxLayer[] = [
    { key: 'cc_sky', buf: drawSky(), sf: 0, mx: 0, my: 0, depth: -100 },
    layer('cc_mountains', 0.1, drawMountains(0.1), -90),
    layer('cc_castle', 0.25, drawCastle(0.25), -80),
    layer('cc_wall', 0.5, drawCourtyardWall(0.5, torches, 'cc_wall'), -70),
    layer('cc_front', 1.25, drawForeground(1.25), 100),
  ];
  return {
    parallax,
    world: { key: 'cc_world', buf: drawGameplay(), x: WORLD_X, y: WORLD_Y, depth: -10 },
    torches,
    ambient: 'embers',
  };
};

/** Top-left position for a parallax layer so it is centered at the reference view. */
export const parallaxPosition = (l: ParallaxLayer): { x: number; y: number } => ({
  x: -l.mx + (REF_CENTER.x - VIEW_W / 2) * l.sf,
  y: -l.my + (REF_CENTER.y - VIEW_H / 2) * l.sf,
});
