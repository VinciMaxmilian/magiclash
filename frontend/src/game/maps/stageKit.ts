import { PixelBuffer, dither2, hashNoise } from '../render/pixelBuffer';
import { PAL } from '../render/palette';
import { VIEW_H, VIEW_W, margins, smoothNoise, type ParallaxLayer } from './castleCourtyardArt';

/** Shared painting helpers for stage art (keeps every map on the same visual rules). */

export const layerBuffer = (sf: number): { b: PixelBuffer; mx: number; my: number } => {
  const { mx, my } = margins(sf);
  return { b: new PixelBuffer(VIEW_W + mx * 2, VIEW_H + my * 2), mx, my };
};

export const makeLayer = (key: string, sf: number, buf: PixelBuffer, depth: number): ParallaxLayer => ({
  key,
  buf,
  sf,
  ...margins(sf),
  depth,
});

/** Vertical banded gradient through `stops`, with 2×2 dither at band edges only. */
export const gradientSky = (stops: readonly number[], horizon: number): PixelBuffer => {
  const b = new PixelBuffer(VIEW_W, VIEW_H);
  const n = stops.length - 1;
  for (let y = 0; y < VIEW_H; y++) {
    const idx = Math.min(1, y / horizon) * n;
    const band = Math.min(n, Math.floor(idx));
    const frac = idx - band;
    for (let x = 0; x < VIEW_W; x++) {
      let c = stops[band];
      if (frac > 0.65 && band < n && dither2(x, y, (frac - 0.65) / 0.35)) c = stops[band + 1];
      b.set(x, y, c);
    }
  }
  return b;
};

export const stars = (b: PixelBuffer, count: number, maxY: number, colors: readonly number[], seed: number) => {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hashNoise(i, 1, seed) * b.w);
    const y = Math.floor(hashNoise(i, 2, seed) * maxY);
    b.set(x, y, colors[i % colors.length]);
  }
};

export const moon = (b: PixelBuffer, x: number, y: number, r: number, body: number, shade: number, halo: number) => {
  for (let yy = -r - 5; yy <= r + 5; yy++) {
    for (let xx = -r - 5; xx <= r + 5; xx++) {
      const d = Math.hypot(xx, yy);
      if (d > r && d <= r + 5 && dither2(x + xx, y + yy, 0.35)) b.set(x + xx, y + yy, halo);
    }
  }
  b.disc(x, y, r, body);
  b.disc(x - 3, y + 2, 2, shade);
  b.disc(x + 4, y - 3, 1.5, shade);
};

/** Filled ridge line (mountains, tree lines) from `base - noise*amp` down to the bottom. */
export const ridge = (
  b: PixelBuffer,
  base: number,
  amp: number,
  freq: number,
  seed: number,
  body: number,
  cap?: { color: number; depth: number },
  jag = 0,
) => {
  for (let x = 0; x < b.w; x++) {
    const n = smoothNoise(x / freq, seed) * 0.7 + smoothNoise(x / (freq / 3), seed + 1) * 0.3;
    const spike = jag ? (x % jag < jag / 2 ? x % jag : jag - (x % jag)) * 1.6 : 0;
    const top = Math.round(base - n * amp - spike);
    for (let y = Math.max(0, top); y < b.h; y++) {
      b.set(x, y, cap && y < top + cap.depth ? cap.color : body);
    }
  }
};

export interface PlatformStyle {
  top: readonly number[];
  body: readonly number[];
  mortar: number;
}

/** Solid block painted as masonry with a bright walkable top edge. */
export const paintSolid = (
  b: PixelBuffer,
  x0: number,
  y0: number,
  w: number,
  h: number,
  st: PlatformStyle,
  brickW: number,
  brickH: number,
  seed: number,
) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c: number;
      if (y === 0) c = st.top[st.top.length - 1];
      else if (y < 4) c = hashNoise(Math.floor(x / 4), y, seed) > 0.55 ? st.top[st.top.length - 1] : st.top[st.top.length - 2];
      else if (y === 4) c = st.mortar;
      else {
        const row = Math.floor((y - 5) / brickH);
        const bx = (x + (row % 2) * (brickW / 2)) % brickW;
        c = st.body[1];
        if (bx === 0 || (y - 5) % brickH === 0) c = st.mortar;
        else if ((y - 5) % brickH === 1) c = st.body[2];
        else if (hashNoise(x, y, seed + 1) > 0.97) c = st.mortar;
      }
      if (x === 0 || x === w - 1) c = y === 0 ? st.top[st.top.length - 1] : st.mortar;
      b.set(x0 + x, y0 + y, c);
    }
  }
};

export const chainUp = (b: PixelBuffer, cx: number, toY: number) => {
  for (let y = 0; y < toY; y++) {
    const link = y % 4;
    if (link === 0) b.set(cx, y, PAL.steel[1]);
    else if (link === 1 || link === 3) {
      b.set(cx - 1, y, PAL.steel[0]);
      b.set(cx + 1, y, PAL.steel[1]);
    } else b.set(cx, y, PAL.steel[0]);
  }
};
