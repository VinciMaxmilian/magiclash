import { describe, expect, it } from 'vitest';
import {
  ATTACK_SLOTS,
  CHARACTERS,
  KNIGHT,
  STAGES,
  resolveSlot,
  validateAttack,
  validateCharacter,
  type CharacterDefinition,
} from '../src';

describe('character configuration', () => {
  it('every registered character passes validation', () => {
    for (const c of Object.values(CHARACTERS)) expect(validateCharacter(c)).toEqual([]);
  });

  it('knight resolves an attack for every input slot', () => {
    for (const slot of ATTACK_SLOTS) expect(resolveSlot(KNIGHT, slot), slot).toBeDefined();
  });

  it('knight has the required move list (PLAN §3)', () => {
    const names = KNIGHT.attacks.map((a) => a.id);
    for (const id of ['front_slash', 'sword_combo_1', 'rising_cut', 'heavy_blow', 'sword_lunge', 'air_slash']) {
      expect(names).toContain(id);
    }
  });

  it('validator catches broken data', () => {
    const broken: CharacterDefinition = structuredClone(KNIGHT);
    broken.attacks[0].startup = 0;
    broken.attacks[1].chain = { next: 'does_not_exist', from: 1, to: 2 };
    broken.moveset.up_light = 'nope';
    const errors = validateCharacter(broken);
    expect(errors.some((e) => e.includes('startup'))).toBe(true);
    expect(errors.some((e) => e.includes('does_not_exist'))).toBe(true);
    expect(errors.some((e) => e.includes('nope'))).toBe(true);
  });

  it('validator rejects hitbox windows outside the active frames', () => {
    const a = structuredClone(KNIGHT.attacks[0]);
    a.hitboxes = [{ x: 0, y: 0, w: 4, h: 4, from: 0, to: a.active + 3 }];
    expect(validateAttack(a).length).toBeGreaterThan(0);
  });

  it('stages have spawns inside the blast zone', () => {
    for (const s of Object.values(STAGES)) {
      for (const p of [...s.spawns, ...s.respawns]) {
        expect(p.x).toBeGreaterThan(s.blastZone.left);
        expect(p.x).toBeLessThan(s.blastZone.right);
        expect(p.y).toBeGreaterThan(s.blastZone.top);
        expect(p.y).toBeLessThan(s.blastZone.bottom);
      }
    }
  });
});
