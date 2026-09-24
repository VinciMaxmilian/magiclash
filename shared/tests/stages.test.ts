import { describe, expect, it } from 'vitest';
import { BotController, STAGES, STAGE_ORDER, Simulation } from '../src';

const sim4 = (stageId: string) =>
  new Simulation({
    stageId,
    fighters: [0, 1, 2, 3].map((i) => ({ characterId: 'knight', team: i, name: `p${i}` })),
    stocks: 3,
    timeLimit: 0,
    seed: 5,
    countdownTicks: 0,
  });

describe('stages', () => {
  it('STAGE_ORDER lists every registered stage once', () => {
    expect([...STAGE_ORDER].sort()).toEqual(Object.keys(STAGES).sort());
  });

  it.each(STAGE_ORDER)('%s: every spawn stands on something', (id) => {
    const sim = sim4(id);
    for (let t = 0; t < 90; t++) sim.step([0, 0, 0, 0]);
    sim.state.fighters.forEach((f, i) => {
      expect(f.grounded, `slot ${i}`).toBe(true);
      expect(f.y, `slot ${i}`).toBe(STAGES[id].spawns[i].y);
      expect(f.stats.falls).toBe(0);
    });
  });

  it.each(STAGE_ORDER)('%s: hard bots finish matches without throwing themselves off', (id) => {
    let sds = 0;
    let falls = 0;
    for (const seed of [3, 4]) {
      const sim = new Simulation({
        stageId: id,
        fighters: [
          { characterId: 'knight', team: 0, name: 'a' },
          { characterId: 'barbarian', team: 1, name: 'b' },
        ],
        stocks: 3,
        timeLimit: 0,
        seed,
        countdownTicks: 0,
      });
      const bots = [new BotController(sim, 0, 'hard', seed), new BotController(sim, 1, 'hard', seed + 9)];
      for (let t = 0; t < 60 * 240 && sim.state.match.status !== 'ended'; t++) sim.step(bots.map((b) => b.think(sim)));
      expect(sim.state.match.status).toBe('ended');
      for (const f of sim.state.fighters) {
        sds += f.stats.selfDestructs;
        falls += f.stats.falls;
      }
    }
    // Castle Courtyard (the reference map) sits at ~0.3 with this matchup; new maps must not be worse.
    expect(sds / falls).toBeLessThanOrEqual(0.34);
  });
});
