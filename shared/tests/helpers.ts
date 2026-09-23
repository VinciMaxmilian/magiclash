import { Simulation, type InputFrame, type MatchConfig, type SimEvent } from '../src';

export const makeSim = (overrides: Partial<MatchConfig> = {}): Simulation =>
  new Simulation({
    stageId: 'castle_courtyard',
    fighters: [
      { characterId: 'knight', team: 0, name: 'P1' },
      { characterId: 'knight', team: 1, name: 'P2' },
    ],
    stocks: 3,
    timeLimit: 0,
    seed: 1234,
    countdownTicks: 0,
    ...overrides,
  });

/** Runs `ticks` steps. `input(tick)` returns the frame for every fighter. */
export const run = (
  sim: Simulation,
  ticks: number,
  input: (tick: number) => InputFrame[] = () => [],
): SimEvent[] => {
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) all.push(...sim.step(input(i)));
  return all;
};

/** Places fighter `i` on the main floor at x, facing `facing`, idle. */
export const place = (sim: Simulation, i: number, x: number, facing: 1 | -1 = 1, y = 0) => {
  const f = sim.state.fighters[i];
  Object.assign(f, { x, y, vx: 0, vy: 0, facing, grounded: true, state: 'idle', attack: null });
};

/** Settle for a few ticks so grounded state is consistent. */
export const settle = (sim: Simulation, ticks = 3) => run(sim, ticks);

/** Events that happened before fighter `i` first touched the ground. */
export const untilLanding = (events: SimEvent[], i = 0): SimEvent[] => {
  const idx = events.findIndex((e) => e.type === 'land' && e.fighter === i);
  return idx < 0 ? events : events.slice(0, idx);
};
