import { toWorldRect, type Rect } from '../core/math';
import type { AttackDefinition, CharacterDefinition } from '../characters/types';
import type { FighterState } from '../sim/types';

/**
 * Hitboxes/hurtboxes are independent from sprite pixels: combat never uses visual collision.
 */

export const worldHurtboxes = (f: FighterState, c: CharacterDefinition): Rect[] =>
  c.hurtboxes.map((r) => toWorldRect(r, f.x, f.y, f.facing));

/** Index of the current frame inside the active window, or -1 when not active. */
export const activeFrameIndex = (f: FighterState, a: AttackDefinition): number => {
  if (!f.attack) return -1;
  const i = f.attack.frame - a.startup;
  return i >= 0 && i < a.active ? i : -1;
};

export const worldHitboxes = (f: FighterState, a: AttackDefinition): Rect[] => {
  const i = activeFrameIndex(f, a);
  if (i < 0) return [];
  return a.hitboxes
    .filter((h) => i >= (h.from ?? 0) && i <= (h.to ?? a.active - 1))
    .map((h) => toWorldRect(h, f.x, f.y, f.facing));
};

export const isInvulnerable = (f: FighterState, c: CharacterDefinition): boolean =>
  f.state === 'dead' ||
  f.invuln > 0 ||
  (f.state === 'dodge' && f.dodgeTicks >= c.dodge.invulnFrom && f.dodgeTicks <= c.dodge.invulnTo);
