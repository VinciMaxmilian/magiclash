import { describe, expect, it } from 'vitest';
import { BotController, Simulation, createRng, nextInt, type BotDifficulty, type SimEvent } from '../src';

const botMatch = (d0: BotDifficulty, d1: BotDifficulty, seed: number, maxTicks = 60 * 240) => {
  const sim = new Simulation({
    stageId: 'castle_courtyard',
    fighters: [
      { characterId: 'knight', team: 0, name: d0 },
      { characterId: 'knight', team: 1, name: d1 },
    ],
    stocks: 3,
    timeLimit: 0,
    seed,
    countdownTicks: 0,
  });
  const bots = [new BotController(sim, 0, d0, seed), new BotController(sim, 1, d1, seed + 1)];
  const events: SimEvent[] = [];
  for (let t = 0; t < maxTicks && sim.state.match.status !== 'ended'; t++) {
    events.push(...sim.step(bots.map((b) => b.think(sim))));
  }
  return { sim, events };
};

describe('determinism', () => {
  it('same seed + same inputs ⇒ identical state', () => {
    const inputsFor = (seed: number) => {
      const rng = createRng(seed);
      return Array.from({ length: 1200 }, () => [nextInt(rng, 0, 255), nextInt(rng, 0, 255)]);
    };
    const seq = inputsFor(99);
    const a = new Simulation({
      stageId: 'castle_courtyard',
      fighters: [
        { characterId: 'knight', team: 0, name: 'a' },
        { characterId: 'knight', team: 1, name: 'b' },
      ],
      stocks: 3,
      timeLimit: 0,
      seed: 5,
      countdownTicks: 0,
    });
    const b = new Simulation(a.config);
    for (const frame of seq) {
      a.step(frame);
      b.step(frame);
    }
    expect(a.hash()).toBe(b.hash());
  });

  it('bot vs bot matches are reproducible', () => {
    expect(botMatch('medium', 'hard', 7, 3000).sim.hash()).toBe(botMatch('medium', 'hard', 7, 3000).sim.hash());
  });
});

describe('bots', () => {
  it('bots fight: they land hits and score KOs', () => {
    const { events, sim } = botMatch('hard', 'hard', 11);
    expect(events.filter((e) => e.type === 'hit').length).toBeGreaterThan(20);
    expect(events.filter((e) => e.type === 'ko').length).toBeGreaterThan(0);
    expect(sim.state.match.status).toBe('ended');
  });

  it('hard bots rarely fall off on their own', () => {
    let sds = 0;
    let falls = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { sim } = botMatch('hard', 'hard', seed);
      for (const f of sim.state.fighters) {
        sds += f.stats.selfDestructs;
        falls += f.stats.falls;
      }
    }
    expect(falls).toBeGreaterThan(0);
    expect(sds / falls).toBeLessThan(0.25);
  });

  it('hard beats easy most of the time', () => {
    let hardWins = 0;
    const seeds = [21, 22, 23, 24, 25, 26];
    for (const seed of seeds) {
      const { sim } = botMatch('hard', 'easy', seed);
      if (sim.state.match.winnerTeam === 0) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(5);
  });
});
