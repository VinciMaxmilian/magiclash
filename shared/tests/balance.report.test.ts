import { it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { BotController, CHARACTER_ORDER, Simulation, type BotDifficulty } from '../src';

/**
 * Opt-in balance report (bot vs bot): STATS_OUT=path npm run sim:balance
 * Writes the character matchup matrix and per-character KO/survival stats.
 */
const OUT = process.env.STATS_OUT ?? '';
const SEEDS = Number(process.env.STATS_SEEDS ?? 6);

const play = (c0: string, c1: string, d0: BotDifficulty, d1: BotDifficulty, seed: number) => {
  const sim = new Simulation({
    stageId: 'castle_courtyard',
    fighters: [
      { characterId: c0, team: 0, name: 'a' },
      { characterId: c1, team: 1, name: 'b' },
    ],
    stocks: 3,
    timeLimit: 300,
    seed,
    countdownTicks: 0,
  });
  const bots = [new BotController(sim, 0, d0, seed), new BotController(sim, 1, d1, seed + 100)];
  const koPct: number[] = [];
  const lastDmg = [0, 0];
  while (sim.state.match.status !== 'ended') {
    sim.state.fighters.forEach((f, i) => {
      if (f.state !== 'dead') lastDmg[i] = f.damage;
    });
    for (const e of sim.step(bots.map((b) => b.think(sim)))) {
      if (e.type === 'ko' && e.by >= 0) koPct.push(lastDmg[e.fighter]);
    }
  }
  return { sim, koPct };
};

it.skipIf(!OUT)('balance report (bot vs bot)', () => {
  writeFileSync(OUT, '');
  const log = (s: string) => appendFileSync(OUT, `${s}\n`);
  const chars = [...CHARACTER_ORDER];
  const wins: Record<string, number> = {};
  const games: Record<string, number> = {};
  const sds: Record<string, number> = {};
  const allKo: number[] = [];
  let totalTicks = 0;
  let matches = 0;
  log(`hard vs hard, ${SEEDS} seeds per side\n`);
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      let wi = 0;
      for (let s = 0; s < SEEDS; s++) {
        for (const swap of [false, true]) {
          const [a, b] = swap ? [chars[j], chars[i]] : [chars[i], chars[j]];
          const { sim, koPct } = play(a, b, 'hard', 'hard', 1000 + s * 7 + (swap ? 3 : 0));
          allKo.push(...koPct);
          totalTicks += sim.state.match.endTick;
          matches++;
          const winner = sim.state.match.winnerTeam === 0 ? a : sim.state.match.winnerTeam === 1 ? b : null;
          if (winner === chars[i]) wi++;
          for (const c of [a, b]) games[c] = (games[c] ?? 0) + 1;
          if (winner) wins[winner] = (wins[winner] ?? 0) + 1;
          sim.state.fighters.forEach((f) => (sds[f.characterId] = (sds[f.characterId] ?? 0) + f.stats.selfDestructs));
        }
      }
      log(`${chars[i].padEnd(15)} vs ${chars[j].padEnd(15)} ${wi}/${SEEDS * 2}`);
    }
  }
  allKo.sort((a, b) => a - b);
  log('\nwin rate:');
  for (const c of chars) log(`  ${c.padEnd(15)} ${(((wins[c] ?? 0) / games[c]) * 100).toFixed(0)}%   self-destructs ${sds[c] ?? 0}`);
  log(`\navg match ${(totalTicks / matches / 60).toFixed(1)}s, KO% median ${allKo[Math.floor(allKo.length / 2)]?.toFixed(0)}`);

  log('\ndifficulty ladder (knight mirror):');
  for (const [d0, d1] of [['hard', 'medium'], ['medium', 'easy'], ['hard', 'easy']] as const) {
    let w = 0;
    for (let s = 0; s < SEEDS; s++) if (play('knight', 'knight', d0, d1, 50 + s).sim.state.match.winnerTeam === 0) w++;
    log(`  ${d0} vs ${d1}: ${w}/${SEEDS}`);
  }
}, 600000);
