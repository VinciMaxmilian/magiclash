import type { AttackDefinition, AttackSlot, CharacterDefinition } from './types';

/**
 * Sanity checks for character data. Runs in tests and at startup in DEV so a typo in a
 * balancing file fails loudly instead of producing a silently broken move.
 */
export const validateCharacter = (c: CharacterDefinition): string[] => {
  const errors: string[] = [];
  const err = (m: string) => errors.push(`[${c.id}] ${m}`);
  const ids = new Set<string>();

  const positive = (label: string, v: number) => {
    if (!(Number.isFinite(v) && v > 0)) err(`${label} must be > 0 (got ${v})`);
  };
  positive('weight', c.weight);
  positive('moveSpeed', c.moveSpeed);
  positive('jumpForce', c.jumpForce);
  positive('gravity', c.gravity);
  positive('maxFallSpeed', c.maxFallSpeed);
  if (c.fastFallSpeed < c.maxFallSpeed) err('fastFallSpeed must be >= maxFallSpeed');
  if (c.maxAirJumps < 0 || !Number.isInteger(c.maxAirJumps)) err('maxAirJumps must be a non-negative integer');
  if (c.hurtboxes.length === 0) err('needs at least one hurtbox');
  if (c.dodge.invulnFrom > c.dodge.invulnTo || c.dodge.invulnTo >= c.dodge.duration) {
    err('dodge invulnerability window must fit inside the dodge');
  }

  for (const a of c.attacks) {
    if (ids.has(a.id)) err(`duplicate attack id ${a.id}`);
    ids.add(a.id);
    errors.push(...validateAttack(a).map((m) => `[${c.id}:${a.id}] ${m}`));
  }

  for (const [slot, id] of Object.entries(c.moveset) as [AttackSlot, string][]) {
    if (!ids.has(id)) err(`moveset slot ${slot} references unknown attack ${id}`);
  }
  for (const a of c.attacks) {
    if (a.chain && !ids.has(a.chain.next)) err(`attack ${a.id} chains into unknown ${a.chain.next}`);
  }
  return errors;
};

export const validateAttack = (a: AttackDefinition): string[] => {
  const errors: string[] = [];
  const intAtLeast = (label: string, v: number, min: number) => {
    if (!Number.isInteger(v) || v < min) errors.push(`${label} must be an integer >= ${min} (got ${v})`);
  };
  intAtLeast('startup', a.startup, 1);
  intAtLeast('active', a.active, 1);
  intAtLeast('recovery', a.recovery, 0);
  intAtLeast('cooldown', a.cooldown, 0);
  if (!(a.damage >= 0 && a.damage <= 60)) errors.push(`damage out of range: ${a.damage}`);
  if (a.knockback.base < 0 || a.knockback.growth < 0) errors.push('knockback must be non-negative');
  if (a.knockback.angle < -90 || a.knockback.angle > 180) errors.push('knockback angle must be in [-90, 180]');
  if (a.hitboxes.length === 0) errors.push('needs at least one hitbox');
  for (const h of a.hitboxes) {
    if (h.w <= 0 || h.h <= 0) errors.push('hitbox with non-positive size');
    if ((h.from ?? 0) > (h.to ?? a.active - 1) || (h.to ?? 0) >= a.active) {
      errors.push('hitbox frame window outside active window');
    }
  }
  const total = a.startup + a.active + a.recovery;
  for (const m of a.movement ?? []) {
    if (m.frame < 0 || m.frame >= total) errors.push(`movement frame ${m.frame} outside attack`);
  }
  if (a.chain && (a.chain.from > a.chain.to || a.chain.to >= total)) errors.push('chain window invalid');
  return errors;
};
