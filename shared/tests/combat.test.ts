import { describe, expect, it } from 'vitest';
import { Btn, CASTLE_COURTYARD, KNIGHT, RESPAWN_DELAY_TICKS, makeInput, type SimEvent } from '../src';
import { makeSim, place, run, settle } from './helpers';

const hits = (events: SimEvent[]) => events.filter((e) => e.type === 'hit');

/** P1 at x=0 facing right, P2 `gap` px in front. */
const faceOff = (gap = 20) => {
  const sim = makeSim();
  place(sim, 0, 0, 1);
  place(sim, 1, gap, -1);
  settle(sim);
  return sim;
};

describe('hitboxes and damage', () => {
  it('a jab hits a target in front and adds damage', () => {
    const sim = faceOff();
    const events = run(sim, 20, (t) => [t === 0 ? Btn.Light : 0]);
    expect(hits(events)).toHaveLength(1);
    expect(sim.state.fighters[1].damage).toBe(KNIGHT.attacks.find((a) => a.id === 'sword_combo_1')!.damage);
  });

  it('a jab does not hit a target behind', () => {
    const sim = makeSim();
    place(sim, 0, 0, 1);
    place(sim, 1, -20, 1);
    settle(sim);
    const events = run(sim, 20, (t) => [t === 0 ? Btn.Light : 0]);
    expect(hits(events)).toHaveLength(0);
  });

  it('each attack instance hits a target only once', () => {
    const sim = faceOff(24);
    // Rising cut has two hitbox phases over 6 active frames.
    const events = run(sim, 30, (t) => [t === 0 ? Btn.Up | Btn.Light : Btn.Up]);
    expect(hits(events).length).toBeLessThanOrEqual(1);
  });

  it('light combo chains into three hits', () => {
    const sim = faceOff(18);
    const events = run(sim, 60, (t) => [t % 8 < 2 ? Btn.Light : 0]);
    const ids = hits(events).map((e) => (e.type === 'hit' ? e.attackId : ''));
    expect(ids.slice(0, 3)).toEqual(['sword_combo_1', 'sword_combo_2', 'sword_combo_3']);
  });

  it('hitstop freezes attacker and target for the same number of ticks', () => {
    const sim = faceOff();
    const events = run(sim, 10, (t) => [t === 0 ? Btn.Light : 0]);
    const hit = hits(events)[0];
    expect(hit).toBeDefined();
    const [a, b] = sim.state.fighters;
    expect(a.hitlag).toBe(b.hitlag);
  });

  it('knockback distance grows with accumulated damage', () => {
    const distanceAt = (damage: number) => {
      const sim = faceOff(20);
      sim.state.fighters[1].damage = damage;
      run(sim, 90, (t) => [t === 0 ? Btn.Right | Btn.Light : 0]);
      return Math.abs(sim.state.fighters[1].x - 20);
    };
    expect(distanceAt(100)).toBeGreaterThan(distanceAt(0) * 2);
  });

  it('dodge invulnerability makes attacks whiff', () => {
    const sim = faceOff();
    // P2 spot-dodges, then P1 jabs inside the invulnerable window.
    const events = run(sim, 20, (t) => [t === 3 ? Btn.Light : 0, t === 0 ? Btn.Dodge : 0]);
    expect(hits(events)).toHaveLength(0);
    expect(sim.state.fighters[1].damage).toBe(0);
  });

  it('heavy attack has startup (reactable) and a long cooldown', () => {
    const sim = faceOff(24);
    const heavy = KNIGHT.attacks.find((a) => a.id === 'heavy_blow')!;
    const events = run(sim, heavy.startup - 1, (t) => [t === 0 ? Btn.Heavy : 0]);
    expect(hits(events)).toHaveLength(0);
    run(sim, 80);
    expect(sim.state.fighters[0].cooldowns[heavy.id]).toBeGreaterThan(0);
  });
});

describe('eliminations', () => {
  it('leaving the blast zone costs a stock and credits the last attacker', () => {
    const sim = faceOff(20);
    const [a, b] = sim.state.fighters;
    b.damage = 250;
    // Put them near the right ledge so the heavy launches P2 out.
    place(sim, 0, 130, 1);
    place(sim, 1, 150, -1);
    settle(sim);
    const events = run(sim, 240, (t) => [t === 0 ? Btn.Heavy : 0]);
    const ko = events.find((e) => e.type === 'ko');
    expect(ko).toBeDefined();
    expect(b.stocks).toBe(2);
    expect(a.stats.kos).toBe(1);
    expect(b.stats.falls).toBe(1);
  });

  it('respawns with 0% and temporary invulnerability', () => {
    const sim = makeSim();
    const f = sim.state.fighters[1];
    f.damage = 90;
    Object.assign(f, { x: CASTLE_COURTYARD.blastZone.right + 5, grounded: false, state: 'air' });
    const events = run(sim, RESPAWN_DELAY_TICKS + 2);
    expect(events.some((e) => e.type === 'ko')).toBe(true);
    expect(events.some((e) => e.type === 'respawn')).toBe(true);
    expect(f.damage).toBe(0);
    expect(f.invuln).toBeGreaterThan(0);
    expect(f.state).not.toBe('dead');
  });

  it('self-destruct gives no KO credit', () => {
    const sim = makeSim();
    const [a, b] = sim.state.fighters;
    Object.assign(b, { y: CASTLE_COURTYARD.blastZone.bottom + 1, grounded: false, state: 'air' });
    run(sim, 2);
    expect(a.stats.kos).toBe(0);
    expect(b.stats.selfDestructs).toBe(1);
  });

  it('match ends when a team runs out of stocks', () => {
    const sim = makeSim({ stocks: 1 });
    const b = sim.state.fighters[1];
    Object.assign(b, { x: CASTLE_COURTYARD.blastZone.left - 5, grounded: false, state: 'air' });
    const events = run(sim, 2);
    expect(events.some((e) => e.type === 'match_end')).toBe(true);
    expect(sim.state.match.status).toBe('ended');
    expect(sim.state.match.winnerTeam).toBe(0);
  });

  it('time out decides by stocks, then damage', () => {
    const sim = makeSim({ timeLimit: 1 });
    sim.state.fighters[0].damage = 50;
    sim.state.fighters[1].damage = 10;
    run(sim, 61);
    expect(sim.state.match.status).toBe('ended');
    expect(sim.state.match.winnerTeam).toBe(1);
  });

  it('countdown blocks actions until GO', () => {
    const sim = makeSim({ countdownTicks: 60 });
    const x0 = sim.state.fighters[0].x;
    run(sim, 59, () => [makeInput('Right')]);
    expect(sim.state.fighters[0].x).toBe(x0);
    run(sim, 20, () => [makeInput('Right')]);
    expect(sim.state.fighters[0].x).toBeGreaterThan(x0);
  });
});
