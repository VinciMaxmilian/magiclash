import { INK } from './palette';

/**
 * Minimal software pixel canvas used to author placeholder art procedurally, pixel by
 * pixel, with palette colors only. Everything is integer-snapped; no anti-aliasing exists.
 */
export class PixelBuffer {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  set(x: number, y: number, color: number, alpha = 255): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = (color >> 16) & 0xff;
    this.data[i + 1] = (color >> 8) & 0xff;
    this.data[i + 2] = color & 0xff;
    this.data[i + 3] = alpha;
  }

  alphaAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  colorAt(x: number, y: number): number {
    const i = (y * this.w + x) * 4;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  clear(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[(y * this.w + x) * 4 + 3] = 0;
  }

  rect(x: number, y: number, w: number, h: number, color: number, alpha = 255): void {
    x = Math.round(x);
    y = Math.round(y);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color, alpha);
  }

  /** Filled rect with top highlight, bottom/back shadow (light from top-front = top-right). */
  shadedRect(x: number, y: number, w: number, h: number, ramp: readonly number[], base = 2): void {
    this.rect(x, y, w, h, ramp[base]);
    this.rect(x, y, w, 1, ramp[Math.min(base + 1, ramp.length - 1)]);
    this.rect(x, y + h - 1, w, 1, ramp[Math.max(base - 1, 0)]);
    this.rect(x, y, 1, h, ramp[Math.max(base - 1, 0)]);
  }

  /** Square-brush line (Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number, color: number, width = 1): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const off = Math.floor((width - 1) / 2);
    for (;;) {
      if (width === 1) this.set(x0, y0, color);
      else this.rect(x0 - off, y0 - off, width, width, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  disc(cx: number, cy: number, r: number, color: number, alpha = 255): void {
    const r2 = r * r + r * 0.8;
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
      for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
        if (x * x + y * y <= r2) this.set(cx + x, cy + y, color, alpha);
      }
    }
  }

  ring(cx: number, cy: number, r: number, thickness: number, color: number): void {
    const outer = r * r + r * 0.8;
    const inner = Math.max(0, (r - thickness) * (r - thickness) + (r - thickness) * 0.8);
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
      for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
        const d = x * x + y * y;
        if (d <= outer && d > inner) this.set(cx + x, cy + y, color);
      }
    }
  }

  /**
   * Stamps a character map. `map` rows use single chars; `colors` maps char → color.
   * '.' and ' ' are transparent. `flip` mirrors horizontally.
   */
  stamp(x: number, y: number, map: readonly string[], colors: Record<string, number>, flip = false): void {
    for (let j = 0; j < map.length; j++) {
      const row = map[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.' || ch === ' ') continue;
        const c = colors[ch];
        if (c === undefined) continue;
        this.set(x + (flip ? row.length - 1 - i : i), y + j, c);
      }
    }
  }

  /** 1px outer outline around every opaque pixel (4-neighbourhood). */
  outline(color = INK): void {
    const mark: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.alphaAt(x, y) > 0) continue;
        if (
          this.alphaAt(x - 1, y) === 255 ||
          this.alphaAt(x + 1, y) === 255 ||
          this.alphaAt(x, y - 1) === 255 ||
          this.alphaAt(x, y + 1) === 255
        ) {
          mark.push(x, y);
        }
      }
    }
    for (let i = 0; i < mark.length; i += 2) this.set(mark[i], mark[i + 1], color);
  }

  /** Copies another buffer at (dx, dy), skipping transparent pixels. */
  blit(src: PixelBuffer, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const a = src.alphaAt(x, y);
        if (a > 0) this.set(dx + x, dy + y, src.colorAt(x, y), a);
      }
    }
  }

  putOn(ctx: CanvasRenderingContext2D, dx: number, dy: number): void {
    const img = new ImageData(new Uint8ClampedArray(this.data), this.w, this.h);
    ctx.putImageData(img, dx, dy);
  }
}

/** 2×2 ordered dither: returns true where the "next" color should be used for a 0..1 mix. */
export const dither2 = (x: number, y: number, t: number): boolean => {
  const m = [0.125, 0.625, 0.875, 0.375][(y & 1) * 2 + (x & 1)];
  return t > m;
};

/** Small deterministic hash-noise for procedural art (stable between reloads). */
export const hashNoise = (x: number, y: number, seed = 0): number => {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
