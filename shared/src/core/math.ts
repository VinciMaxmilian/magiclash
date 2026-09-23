export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned rectangle. `x`,`y` = top-left corner. World Y grows downward. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

/** Move `v` toward `target` by at most `step`. */
export const approach = (v: number, target: number, step: number): number =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Converts a rect authored relative to a fighter's feet anchor while facing right
 * into world space, mirroring it when facing left.
 */
export const toWorldRect = (local: Rect, originX: number, originY: number, facing: 1 | -1): Rect => ({
  x: facing === 1 ? originX + local.x : originX - local.x - local.w,
  y: originY + local.y,
  w: local.w,
  h: local.h,
});

export const rectCenter = (r: Rect): Vec2 => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export const DEG = Math.PI / 180;
