import { it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { BotController, Simulation, type BotDifficulty } from '../src';

/** Opt-in balance report: STATS_OUT=path npm run sim:balance */
const OUT = process.env.STATS_OUT ?? '';
it.skipIf(!OUT)('balance report (bot vs bot)', () => {
  writeFileSync(OUT, '');
  const pairs: [BotDifficulty, BotDifficulty][] = [['hard','hard'],['medium','medium'],['easy','easy'],['hard','easy'],['medium','easy'],['hard','medium']];
  for (const [d0, d1] of pairs) {
    let wins0 = 0, ticks = 0, kos = 0, sds = 0, hits = 0, unfinished = 0;
    const koPct: number[] = [];
    const n = 8;
    for (let seed = 1; seed <= n; seed++) {
      const sim = new Simulation({ stageId: 'castle_courtyard', fighters: [{characterId:'knight',team:0,name:'a'},{characterId:'knight',team:1,name:'b'}], stocks: 3, timeLimit: 0, seed, countdownTicks: 0 });
      const bots = [new BotController(sim,0,d0,seed), new BotController(sim,1,d1,seed+100)];
      const lastDmg = [0,0];
      let t = 0;
      for (; t < 60*300 && sim.state.match.status !== 'ended'; t++) {
        sim.state.fighters.forEach((f,i)=>{ if (f.state!=='dead') lastDmg[i]=f.damage; });
        const ev = sim.step(bots.map(b=>b.think(sim)));
        for (const e of ev) { if (e.type==='ko' && e.by>=0) koPct.push(lastDmg[e.fighter]); if (e.type==='hit') hits++; }
      }
      if (sim.state.match.status !== 'ended') unfinished++;
      ticks += t; if (sim.state.match.winnerTeam === 0) wins0++;
      for (const f of sim.state.fighters) { kos += f.stats.kos; sds += f.stats.selfDestructs; }
    }
    koPct.sort((a,b)=>a-b);
    appendFileSync(OUT, `${d0} vs ${d1}: p0 wins ${wins0}/${n}, avg ${(ticks/n/60).toFixed(1)}s, kos ${kos}, SDs ${sds}, hits/match ${(hits/n).toFixed(0)}, KO% med ${koPct[Math.floor(koPct.length/2)]?.toFixed(0)} min ${koPct[0]?.toFixed(0)} max ${koPct.at(-1)?.toFixed(0)}, unfinished ${unfinished}\n`);
  }
}, 120000);
