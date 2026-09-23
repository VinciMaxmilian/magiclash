import { DEG, clamp } from '../core/math';
import type { KnockbackDefinition } from '../characters/types';

/**
 * Accumulated damage + progressive knockback.
 *
 * Damage doesn't kill: it makes every following hit launch farther. Eliminations happen
 * when a fighter crosses the stage blast zone.
 *
 *   launch = (base + growth * damage/100) / weight
 *
 * `damage` is the target's damage AFTER the hit is applied, so the hit that takes you
 * to 120% already launches like a 120% hit.
 */
export const COMBAT = {
  /** Hitstun ticks per unit of launch speed. */
  hitstunPerLaunch: 2.9,
  maxHitstun: 70,
  minHitstun: 6,
  /** Maximum launch speed (px/tick) to keep the game readable. */
  maxLaunch: 24,
  /** Hitstop = base + damage * perDamage (+ attack bonus), capped. Both fighters freeze. */
  hitstopBase: 3,
  hitstopPerDamage: 0.4,
  maxHitstop: 14,
  /** Launched fighters: per-tick velocity damping and gravity scale while in hitstun. */
  launchDrag: 0.966,
  launchGravityScale: 0.8,
  /** Above this launch speed the renderer shows knockback trails. */
  trailSpeed: 7,
  /** Downward speed (px/tick) above which a hitstunned fighter bounces off the floor. */
  bounceSpeed: 4,
  bounceRestitution: 0.45,
} as const;

export const launchSpeed = (kb: KnockbackDefinition, damageAfterHit: number, weight: number): number =>
  clamp((kb.base + (kb.growth * damageAfterHit) / 100) / weight, 0, COMBAT.maxLaunch);

/**
 * Launch velocity vector. `facing` is the attacker's facing. Downward (spike) angles are
 * flattened when the target is grounded — you can't spike someone into the floor.
 */
export const launchVector = (
  angleDeg: number,
  speed: number,
  facing: 1 | -1,
  targetGrounded: boolean,
): { vx: number; vy: number } => {
  const angle = targetGrounded && angleDeg < 0 ? 25 : angleDeg;
  return {
    vx: Math.cos(angle * DEG) * speed * facing,
    vy: -Math.sin(angle * DEG) * speed,
  };
};

export const hitstunTicks = (speed: number, multiplier: number): number =>
  Math.round(clamp(speed * COMBAT.hitstunPerLaunch * multiplier, COMBAT.minHitstun, COMBAT.maxHitstun));

export const hitstopTicks = (damage: number, bonus = 0): number =>
  Math.min(COMBAT.maxHitstop, Math.floor(COMBAT.hitstopBase + damage * COMBAT.hitstopPerDamage + bonus));
