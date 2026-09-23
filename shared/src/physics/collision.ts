import { rectsOverlap, type Rect } from '../core/math';
import type { StageDefinition } from './stage';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface CollisionResult {
  landed: boolean;
  /** Vertical speed right before landing (for bounce/land effects). */
  impactVy: number;
  onPlatform: boolean;
  hitCeiling: boolean;
  /** -1 wall on the left, 1 on the right, 0 none. */
  wall: -1 | 0 | 1;
  /** Horizontal speed right before hitting a wall. */
  impactVx: number;
}

export const bodyRect = (x: number, y: number, w: number, h: number): Rect => ({
  x: x - w / 2,
  y: y - h,
  w,
  h,
});

/**
 * Axis-separated AABB movement against solids and one-way platforms.
 * Mutates `b`. Position is the feet anchor (bottom-center of the body).
 */
export const moveAndCollide = (
  b: Body,
  w: number,
  h: number,
  stage: StageDefinition,
  ignorePlatforms: boolean,
): CollisionResult => {
  const res: CollisionResult = {
    landed: false,
    impactVy: 0,
    onPlatform: false,
    hitCeiling: false,
    wall: 0,
    impactVx: 0,
  };
  const hw = w / 2;

  // ── X ───────────────────────────────────────────────
  b.x += b.vx;
  for (const s of stage.solids) {
    if (!rectsOverlap(bodyRect(b.x, b.y, w, h), s)) continue;
    const pushLeft = s.x - hw; // place body left of the block
    const pushRight = s.x + s.w + hw;
    const goLeft = b.vx > 0 || (b.vx === 0 && b.x - pushLeft < pushRight - b.x);
    b.x = goLeft ? pushLeft : pushRight;
    res.wall = goLeft ? 1 : -1;
    res.impactVx = b.vx;
    b.vx = 0;
  }

  // ── Y ───────────────────────────────────────────────
  const prevBottom = b.y;
  b.y += b.vy;
  for (const s of stage.solids) {
    if (!rectsOverlap(bodyRect(b.x, b.y, w, h), s)) continue;
    if (b.vy >= 0) {
      b.y = s.y;
      res.landed = true;
      res.impactVy = b.vy;
    } else {
      b.y = s.y + s.h + h;
      res.hitCeiling = true;
    }
    b.vy = 0;
  }

  if (!res.landed && b.vy >= 0 && !ignorePlatforms) {
    for (const p of stage.platforms) {
      const withinX = b.x + hw > p.x && b.x - hw < p.x + p.w;
      if (withinX && prevBottom <= p.y + 0.001 && b.y >= p.y) {
        res.landed = true;
        res.onPlatform = true;
        res.impactVy = b.vy;
        b.y = p.y;
        b.vy = 0;
        break;
      }
    }
  }
  return res;
};
