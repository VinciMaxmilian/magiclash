import { describe, expect, it } from 'vitest';
import {
  ATTACK_SLOTS,
  BotController,
  Btn,
  CHARACTERS,
  CHARACTER_ORDER,
  STAGE_ORDER,
  Simulation,
  resolveSlot,
  type SimEvent,
} from '../src';
import { place, run, settle } from './helpers';

const duel = (a: string, b: string, stageId = 'castle_courtyard') =>
  new Simulation({
    stageId,
    fighters: [
      { characterId: a, team: 0, name: 'a' },
      { characterId: b, team: 1, name: 'b' },
    ],
    stocks: 3,
    timeLimit: 0,
    seed: 3,
    countdownTicks: 0,
  });

const hitsOn = (events: SimEvent[], target: number) =>
  events.filter((e) => e.type === 'hit' && e.target === target) as Extract<SimEvent, { type: 'hit' }>[];

describe('every class', () => {
  it('resolves an attack for all 16 input slots', () => {
    for (const c of Object.values(CHARACTERS)) {
      for (const slot of ATTACK_SLOTS) expect(resolveSlot(c, slot), `${c.id}:${slot}`).toBeDefined();
    }
  });

  it('bot matches run to completion on every stage for every class', () => {
    CHARACTER_ORDER.forEach((c, i) => {
      const other = CHARACTER_ORDER[(i + 1) % CHARACTER_ORDER.length];
      const stage = STAGE_ORDER[i % STAGE_ORDER.length];
      const sim = new Simulation({
        stageId: stage,
        fighters: [
          { characterId: c, team: 0, name: 'a' },
          { characterId: other, team: 1, name: 'b' },
        ],
        stocks: 2,
        timeLimit: 240,
        seed: 40 + i,
        countdownTicks: 0,
      });
      const bots = [new BotController(sim, 0, 'hard', 1), new BotController(sim, 1, 'hard', 2)];
      let hits = 0;
      while (sim.state.match.status !== 'ended') {
        for (const e of sim.step(bots.map((b) => b.think(sim)))) if (e.type === 'hit') hits++;
      }
      expect(hits, `${c} vs ${other} on ${stage}`).toBeGreaterThan(5);
    });
  });

  it('4-player 2v2 works without friendly fire', () => {
    const sim = new Simulation({
      stageId: 'frozen_fortress',
      fighters: [
        { characterId: 'knight', team: 0, name: 'a' },
        { characterId: 'fire_mage', team: 0, name: 'b' },
        { characterId: 'archer', team: 1, name: 'c' },
        { characterId: 'barbarian', team: 1, name: 'd' },
      ],
      stocks: 2,
      timeLimit: 300,
      seed: 9,
      countdownTicks: 0,
    });
    const bots = [0, 1, 2, 3].map((i) => new BotController(sim, i, 'medium', i));
    let friendly = 0;
    while (sim.state.match.status !== 'ended') {
      for (const e of sim.step(bots.map((b) => b.think(sim)))) {
        if (e.type === 'hit' && sim.state.fighters[e.attacker].team === sim.state.fighters[e.target].team) friendly++;
      }
    }
    expect(friendly).toBe(0);
    expect([0, 1, -1]).toContain(sim.state.match.winnerTeam);
  });
});

describe('projectiles', () => {
  it('archer arrow hits a distant target', () => {
    const sim = duel('archer', 'knight');
    place(sim, 0, -100, 1);
    place(sim, 1, 60, -1);
    settle(sim);
    const events = run(sim, 60, (t) => [t === 0 ? Btn.Light : 0]);
    expect(events.some((e) => e.type === 'projectile_spawn')).toBe(true);
    const h = hitsOn(events, 1);
    expect(h.length).toBe(1);
    expect(h[0].attackId).toBe('arrow');
  });

  it('charging the shot makes it hit harder', () => {
    const damageFor = (holdTicks: number) => {
      const sim = duel('archer', 'knight');
      place(sim, 0, -100, 1);
      place(sim, 1, 60, -1);
      settle(sim);
      const events = run(sim, 150, (t) => [t < holdTicks ? Btn.Heavy : 0]);
      return hitsOn(events, 1)[0]?.damage ?? 0;
    };
    const quick = damageFor(1);
    const full = damageFor(80);
    expect(quick).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(quick * 1.8);
  });

  it('arrows stick in walls and disappear later', () => {
    const sim = duel('archer', 'knight');
    const f = sim.state.fighters[0];
    Object.assign(f, { x: -250, y: 20, grounded: false, state: 'air', facing: 1 });
    run(sim, 1, () => [Btn.Right | Btn.Light]);
    const events = run(sim, 40);
    expect(events.some((e) => e.type === 'projectile_end' && e.reason === 'stage')).toBe(true);
    expect(sim.state.projectiles.some((p) => p.stuck >= 0)).toBe(true);
    run(sim, 80);
    expect(sim.state.projectiles).toHaveLength(0);
  });

  it('fireball explodes and the blast also hits a second target', () => {
    const sim = new Simulation({
      stageId: 'castle_courtyard',
      fighters: [
        { characterId: 'fire_mage', team: 0, name: 'a' },
        { characterId: 'knight', team: 1, name: 'b' },
        { characterId: 'knight', team: 2, name: 'c' },
      ],
      stocks: 3,
      timeLimit: 0,
      seed: 1,
      countdownTicks: 0,
    });
    place(sim, 0, -100, 1);
    place(sim, 1, -20, -1);
    place(sim, 2, -4, -1);
    settle(sim);
    const events = run(sim, 60, (t) => [t === 0 ? Btn.Right | Btn.Light : 0]);
    expect(events.some((e) => e.type === 'explosion')).toBe(true);
    expect(hitsOn(events, 1).length).toBeGreaterThan(0);
    expect(hitsOn(events, 2).length).toBeGreaterThan(0);
  });

  it('ice slows the target', () => {
    const sim = duel('ice_mage', 'knight');
    place(sim, 0, -100, 1);
    place(sim, 1, 0, -1);
    settle(sim);
    run(sim, 40, (t) => [t === 0 ? Btn.Right | Btn.Light : 0]);
    const k = sim.state.fighters[1];
    expect(k.slowTicks).toBeGreaterThan(0);
    expect(k.slowFactor).toBeLessThan(1);
  });

  it('lightning beam vanishes when the caster is interrupted', () => {
    const sim = duel('lightning_mage', 'knight');
    place(sim, 0, 0, 1);
    place(sim, 1, 200, -1);
    settle(sim);
    const beam = CHARACTERS.lightning_mage.attacks.find((a) => a.id === 'thunder_beam_cast')!;
    run(sim, beam.startup + 1, (t) => [t === 0 ? Btn.Light : 0]);
    expect(sim.state.projectiles.some((p) => p.defId === 'thunder_beam')).toBe(true);
    Object.assign(sim.state.fighters[0], { state: 'hitstun', hitstun: 20, attack: null });
    run(sim, 1);
    expect(sim.state.projectiles.some((p) => p.defId === 'thunder_beam')).toBe(false);
  });

  it('grounded columns fizzle over the void', () => {
    const sim = duel('fire_mage', 'knight');
    place(sim, 0, 170, 1);
    settle(sim);
    const events = run(sim, 30, (t) => [t === 0 ? Btn.Right | Btn.Heavy : Btn.Right]);
    expect(events.some((e) => e.type === 'projectile_spawn' && e.defId === 'fire_column')).toBe(false);
  });
});

describe('barbarian axe', () => {
  it('throwing disarms, attacks become unarmed, and the axe comes back', () => {
    const sim = duel('barbarian', 'knight');
    const b = sim.state.fighters[0];
    place(sim, 0, -60, 1);
    place(sim, 1, 150, -1);
    settle(sim);
    run(sim, 20, (t) => [t === 0 ? Btn.Right | Btn.Heavy : 0]);
    expect(b.weaponOut).toBe(true);
    run(sim, 30);
    const ev = run(sim, 2, (t) => [t === 0 ? Btn.Light : 0]);
    expect(ev.find((e) => e.type === 'attack_start')).toMatchObject({ attackId: 'fist_jab' });
    run(sim, 120);
    const axe = sim.state.projectiles.find((p) => p.owner === 0);
    if (axe && axe.stuck >= 0) {
      Object.assign(b, { x: axe.x, y: axe.y + 4, grounded: false, state: 'air', vx: 0, vy: 0 });
      const back = run(sim, 3);
      expect(back.some((e) => e.type === 'weapon_back' && e.picked)).toBe(true);
    }
    expect(b.weaponOut).toBe(false);
  });

  it('the axe returns by itself after its stuck lifetime', () => {
    const sim = duel('barbarian', 'knight');
    const b = sim.state.fighters[0];
    place(sim, 0, 120, 1);
    place(sim, 1, -150, 1);
    settle(sim);
    run(sim, 20, (t) => [t === 0 ? Btn.Right | Btn.Heavy : 0]);
    expect(b.weaponOut).toBe(true);
    run(sim, 600);
    expect(b.weaponOut).toBe(false);
  });
});
