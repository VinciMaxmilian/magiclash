import { describe, expect, it } from 'vitest';
import { COMBAT, hitstopTicks, hitstunTicks, launchSpeed, launchVector } from '../src';

const kb = { base: 4, growth: 8, angle: 45 };

describe('knockback formulas', () => {
  it('knockback grows with accumulated damage', () => {
    expect(launchSpeed(kb, 100, 1)).toBeGreaterThan(launchSpeed(kb, 50, 1));
    expect(launchSpeed(kb, 50, 1)).toBeGreaterThan(launchSpeed(kb, 0, 1));
  });

  it('heavier fighters fly less', () => {
    expect(launchSpeed(kb, 80, 1.2)).toBeLessThan(launchSpeed(kb, 80, 0.9));
  });

  it('launch speed is capped', () => {
    expect(launchSpeed(kb, 999, 0.5)).toBe(COMBAT.maxLaunch);
  });

  it('launch direction follows attacker facing and angle', () => {
    const right = launchVector(45, 10, 1, false);
    const left = launchVector(45, 10, -1, false);
    expect(right.vx).toBeGreaterThan(0);
    expect(left.vx).toBeLessThan(0);
    expect(right.vy).toBeLessThan(0); // up is negative Y
  });

  it('spikes against grounded targets are flattened upward', () => {
    expect(launchVector(-60, 10, 1, true).vy).toBeLessThan(0);
    expect(launchVector(-60, 10, 1, false).vy).toBeGreaterThan(0);
  });

  it('hitstun and hitstop are bounded', () => {
    expect(hitstunTicks(0, 1)).toBe(COMBAT.minHitstun);
    expect(hitstunTicks(100, 1)).toBe(COMBAT.maxHitstun);
    expect(hitstopTicks(60, 10)).toBe(COMBAT.maxHitstop);
    expect(hitstopTicks(16)).toBeGreaterThan(hitstopTicks(3));
  });
});
