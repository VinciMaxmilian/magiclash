import type { AttackDefinition, AttackSlot, CharacterDefinition } from './types';

/** Fallback order when a character doesn't define a slot. */
const FALLBACKS: Partial<Record<AttackSlot, AttackSlot[]>> = {
  side_light: ['neutral_light'],
  up_light: ['neutral_light'],
  down_light: ['neutral_light'],
  side_heavy: ['neutral_heavy'],
  up_heavy: ['neutral_heavy'],
  down_heavy: ['neutral_heavy'],
  air_neutral_light: ['air_side_light'],
  air_side_light: ['air_neutral_light'],
  air_up_light: ['air_neutral_light', 'air_side_light'],
  air_down_light: ['air_neutral_light', 'air_side_light'],
  air_neutral_heavy: ['air_side_heavy'],
  air_side_heavy: ['air_neutral_heavy'],
  air_up_heavy: ['air_neutral_heavy'],
  air_down_heavy: ['air_neutral_heavy'],
};

export const slotFor = (
  airborne: boolean,
  heavy: boolean,
  dirX: -1 | 0 | 1,
  dirY: -1 | 0 | 1,
): AttackSlot => {
  // Up has priority over side (anti-air), down over side (low attacks).
  const dir = dirY === -1 ? 'up' : dirY === 1 ? 'down' : dirX !== 0 ? 'side' : 'neutral';
  return `${airborne ? 'air_' : ''}${dir}_${heavy ? 'heavy' : 'light'}` as AttackSlot;
};

export const resolveSlot = (c: CharacterDefinition, slot: AttackSlot): string | undefined => {
  if (c.moveset[slot]) return c.moveset[slot];
  for (const fb of FALLBACKS[slot] ?? []) {
    if (c.moveset[fb]) return c.moveset[fb];
  }
  return undefined;
};

/** Pre-indexed attack lookup per character (built once at registry time). */
export const indexAttacks = (c: CharacterDefinition): Map<string, AttackDefinition> =>
  new Map(c.attacks.map((a) => [a.id, a]));
