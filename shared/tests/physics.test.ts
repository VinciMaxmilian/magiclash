import { describe, expect, it } from 'vitest';
import { Btn, CASTLE_COURTYARD, KNIGHT, makeInput } from '../src';
import { makeSim, place, run, settle, untilLanding } from './helpers';

const P = CASTLE_COURTYARD.platforms;

describe('movement and platforms', () => {
  it('fighters start grounded on the main floor and stay there', () => {
    const sim = makeSim();
    settle(sim, 30);
    for (const f of sim.state.fighters) {
      expect(f.grounded).toBe(true);
      expect(f.y).toBe(0);
    }
  });

  it('running reaches but never exceeds move speed', () => {
    const sim = makeSim();
    let maxVx = 0;
    run(sim, 40, () => [makeInput('Right')]).forEach(() => undefined);
    for (let i = 0; i < 20; i++) {
      sim.step([makeInput('Right')]);
      maxVx = Math.max(maxVx, sim.state.fighters[0].vx);
    }
    expect(maxVx).toBeCloseTo(KNIGHT.moveSpeed, 5);
  });

  it('full jump clears the side platforms height', () => {
    const sim = makeSim();
    let minY = 0;
    for (let i = 0; i < 60; i++) {
      sim.step([makeInput('Jump')]);
      minY = Math.min(minY, sim.state.fighters[0].y);
    }
    expect(minY).toBeLessThan(P[0].y);
  });

  it('releasing jump early gives a short hop', () => {
    const full = makeSim();
    const short = makeSim();
    let fullMin = 0;
    let shortMin = 0;
    for (let i = 0; i < 60; i++) {
      full.step([makeInput('Jump')]);
      short.step([i < 3 ? makeInput('Jump') : 0]);
      fullMin = Math.min(fullMin, full.state.fighters[0].y);
      shortMin = Math.min(shortMin, short.state.fighters[0].y);
    }
    expect(shortMin).toBeGreaterThan(fullMin + 20);
  });

  it('air jumps are limited', () => {
    const sim = makeSim();
    const events = run(sim, 80, (t) => [t % 6 < 3 ? makeInput('Jump') : 0]);
    const jumps = untilLanding(events).filter((e) => e.type === 'jump' && e.fighter === 0);
    expect(jumps.filter((e) => e.type === 'jump' && e.kind === 'air').length).toBe(KNIGHT.maxAirJumps);
  });

  it('one-way platform: pass through from below, land from above', () => {
    const sim = makeSim();
    const px = P[0].x + P[0].w / 2;
    place(sim, 0, px);
    let landedOnPlatform = false;
    for (let i = 0; i < 90; i++) {
      sim.step([i < 20 ? makeInput('Jump') : 0]);
      const f = sim.state.fighters[0];
      if (f.grounded && f.onPlatform) landedOnPlatform = true;
    }
    expect(landedOnPlatform).toBe(true);
    expect(sim.state.fighters[0].y).toBe(P[0].y);
  });

  it('holding down drops through a one-way platform', () => {
    const sim = makeSim();
    const f = sim.state.fighters[0];
    place(sim, 0, P[0].x + 40, 1, P[0].y);
    settle(sim);
    expect(f.onPlatform).toBe(true);
    run(sim, 30, () => [makeInput('Down')]);
    expect(f.y).toBeGreaterThan(P[0].y);
  });

  it('tapping down + light on a platform does a down attack instead of dropping', () => {
    const sim = makeSim();
    const f = sim.state.fighters[0];
    place(sim, 0, P[0].x + 40, 1, P[0].y);
    settle(sim);
    sim.step([Btn.Down | Btn.Light]);
    expect(f.state).toBe('attack');
    expect(f.attack?.id).toBe('low_sweep');
    expect(f.onPlatform).toBe(true);
  });

  it('walking off the ledge makes the fighter airborne, with a short coyote-jump window', () => {
    const sim = makeSim();
    const f = sim.state.fighters[0];
    place(sim, 0, CASTLE_COURTYARD.solids[0].x + CASTLE_COURTYARD.solids[0].w - 4, 1);
    let left = -1;
    for (let i = 0; i < 20 && left < 0; i++) {
      sim.step([makeInput('Right')]);
      if (!f.grounded) left = i;
    }
    expect(left).toBeGreaterThanOrEqual(0);
    const before = f.airJumps;
    sim.step([makeInput('Jump')]);
    expect(f.vy).toBeLessThan(0);
    expect(f.airJumps).toBe(before); // used the ground jump, not an air jump
  });

  it('solid walls stop horizontal movement', () => {
    const sim = makeSim();
    const f = sim.state.fighters[0];
    const main = CASTLE_COURTYARD.solids[0];
    Object.assign(f, { x: main.x - 30, y: 20, vx: 0, vy: 0, grounded: false, state: 'air' });
    run(sim, 20, () => [makeInput('Right')]);
    expect(f.x).toBeLessThanOrEqual(main.x - KNIGHT.body.w / 2 + 0.001);
  });
});
