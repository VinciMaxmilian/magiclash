import type { Rect } from '../core/math';
import type { AttackDefinition, WhipDefinition } from '../characters/types';

/**
 * Whip lash as a pure function of the attack frame: no stored state, so it is deterministic,
 * identical on client and server and needs nothing extra in network snapshots.
 *
 * A guide angle sweeps from the rest pose to the wind-up (startup) and then snaps to the strike
 * with a small overshoot. Rope point i follows the guide `lag · i/N` frames late, so the lash
 * travels down the rope and the tip arrives last — the visible curve and the damaging area are
 * the same thing. Angles are degrees in screen space for a fighter facing right (0 = forward,
 * -90 = up, 90 = down) and are not normalized: the path between two angles is the sweep.
 */

const DEG = Math.PI / 180;
/** Rest angle before the wind-up (hanging slightly behind the hand). */
const REST = 100;
/** How late the tip is compared to the hand (frames). */
const LAG = 3;
/** Frames the strike takes to reach its angle (before overshoot settles). */
const SNAP = 4;
/** Spins flatten the circle vertically so it reads as a whirl around the body. */
const SPIN_FLATTEN = 0.4;
/** Degrees per charge tick while a charged lash whirls overhead. */
const CHARGE_SPIN = 20;

export const WHIP_SEGMENTS = 12;

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** Ease-out with overshoot (settles back to 1). */
const backOut = (t: number) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = 1.9;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

/** Guide angle at a (possibly fractional) attack frame. */
const guide = (w: WhipDefinition, a: AttackDefinition, t: number): number => {
  const S = a.startup;
  if (t < S) return REST + (w.wind - REST) * smooth(t / Math.max(1, S - 1));
  if (w.spin) return w.wind + (w.spin * (t - S)) / Math.max(1, a.active);
  return w.wind + (w.strike - w.wind) * backOut((t - S) / SNAP);
};

/** Hand position (relative to the feet, facing right): moves from the wind-up to the strike pose. */
const handAt = (w: WhipDefinition, a: AttackDefinition, t: number): [number, number] => {
  const k = smooth((t - a.startup + 1) / 2);
  return [w.handFrom[0] + (w.hand[0] - w.handFrom[0]) * k, w.handFrom[1] + (w.hand[1] - w.handFrom[1]) * k];
};

/**
 * Rope points in world space. `frame` may be fractional (renderer interpolation); `charge` is
 * the held charge ticks (a charged lash whirls overhead while held).
 */
export const whipPoints = (
  w: WhipDefinition,
  a: AttackDefinition,
  frame: number,
  charge: number,
  x: number,
  y: number,
  facing: 1 | -1,
): { x: number; y: number }[] => {
  const n = WHIP_SEGMENTS;
  const seg = w.length / n;
  const holding = !!a.charge && charge > 0 && Math.floor(frame) === a.charge.frame;
  const [hx, hy] = handAt(w, a, frame);
  const pts = [{ x: x + hx * facing, y: y + hy }];
  const flat = w.spin ? SPIN_FLATTEN : 1;
  for (let i = 1; i <= n; i++) {
    const lag = (LAG * i) / n;
    const ang = holding ? w.wind + CHARGE_SPIN * (charge - lag) : guide(w, a, frame - lag);
    const prev = pts[i - 1];
    pts.push({ x: prev.x + Math.cos(ang * DEG) * seg * facing, y: prev.y + Math.sin(ang * DEG) * seg * flat });
  }
  return pts;
};

/** First rope point that hurts (the part inside the fist never does). */
const HURT_FROM = 2;

/** Damaging boxes along the rope for this frame (callers check the attack's active window). */
export const whipHitboxes = (
  w: WhipDefinition,
  a: AttackDefinition,
  frame: number,
  charge: number,
  x: number,
  y: number,
  facing: 1 | -1,
): Rect[] => {
  const size = w.thickness ?? 10;
  const pts = whipPoints(w, a, frame, charge, x, y, facing);
  const out: Rect[] = [];
  for (let i = HURT_FROM; i < pts.length; i++) {
    const p = pts[i];
    out.push({ x: p.x - size / 2, y: p.y - size / 2, w: size, h: size });
  }
  return out;
};
