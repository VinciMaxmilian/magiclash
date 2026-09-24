import { describe, expect, it } from 'vitest';
import { Btn, CHARACTERS, SEASONS, STAGES, Simulation, isInvulnerable, validateCharacter, whipPoints, worldHitboxes, type SimEvent } from '../src';
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
    seed: 5,
    countdownTicks: 0,
  });

const hitsOn = (events: SimEvent[], target: number) =>
  events.filter((e) => e.type === 'hit' && e.target === target) as Extract<SimEvent, { type: 'hit' }>[];

/** Presses `buttons` once (plus a held direction) and then lets the attack play out. */
describe('Temporada 1', () => {
  it('season manifest only lists content that exists', () => {
    for (const s of SEASONS) {
      for (const c of s.characters) expect(CHARACTERS[c], c).toBeDefined();
      for (const st of s.stages) expect(STAGES[st], st).toBeDefined();
    }
  });

  it('new characters have valid data', () => {
    for (const id of SEASONS[0].characters) expect(validateCharacter(CHARACTERS[id])).toEqual([]);
  });

  it('hunter chain whip reaches much farther than the knight sword', () => {
    const sim = duel('hunter', 'knight');
    place(sim, 0, -40, 1);
    place(sim, 1, 16, -1);
    settle(sim);
    expect(hitsOn(run(sim, 40, (t) => [t < 2 ? Btn.Light : 0, 0]), 1).length).toBe(1);
  });

  it('whip hitboxes are the rope: every active frame, the boxes sit on the rope points', () => {
    const sim = duel('hunter', 'knight');
    place(sim, 0, -40, 1);
    place(sim, 1, 150, -1);
    settle(sim);
    const f = sim.state.fighters[0];
    const atk = CHARACTERS.hunter.attacks.find((a) => a.id === 'whip_snap')!;
    let checked = 0;
    run(sim, 30, (t) => {
      if (f.attack?.id === 'whip_snap' && f.attack.frame >= atk.startup && f.attack.frame < atk.startup + atk.active) {
        const pts = whipPoints(atk.whip!, atk, f.attack.frame, 0, f.x, f.y, f.facing);
        const boxes = worldHitboxes(f, atk);
        const tip = boxes[boxes.length - 1];
        expect(tip.x + tip.w / 2).toBeCloseTo(pts[pts.length - 1].x, 5);
        expect(tip.y + tip.h / 2).toBeCloseTo(pts[pts.length - 1].y, 5);
        checked++;
      }
      return [t < 2 ? Btn.Light : 0, 0];
    });
    expect(checked).toBe(atk.active);
  });

  it('the tip lashes out late: a target at full reach is hit after the base of the whip', () => {
    const hitFrame = (distance: number) => {
      const sim = duel('hunter', 'knight');
      place(sim, 0, -40, 1);
      place(sim, 1, -40 + distance, -1);
      settle(sim);
      for (let t = 0; t < 30; t++) {
        if (sim.step([t < 2 ? Btn.Light : 0, 0]).some((e) => e.type === 'hit')) return t;
      }
      return -1;
    };
    const near = hitFrame(20);
    const far = hitFrame(60);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
  });

  it('chain whirl hits someone standing behind', () => {
    const sim = duel('hunter', 'knight');
    place(sim, 0, 0, 1);
    place(sim, 1, -34, 1);
    settle(sim);
    const ev = run(sim, 50, (t) => [t < 2 ? Btn.Heavy | Btn.Down : 0, 0]);
    expect(hitsOn(ev, 1).length).toBe(1);
  });

  it('hunter throws a dagger that hits at range', () => {
    const sim = duel('hunter', 'knight');
    place(sim, 0, -120, 1);
    place(sim, 1, 60, -1);
    settle(sim);
    const ev = run(sim, 60, (t) => [t < 2 ? Btn.Light | Btn.Right : 0, 0]);
    expect(ev.some((e) => e.type === 'projectile_spawn' && e.defId === 'dagger')).toBe(true);
    expect(hitsOn(ev, 1).length).toBeGreaterThan(0);
  });

  it('brawler rune disc flies out and comes back (boomerang)', () => {
    const sim = duel('brawler', 'knight');
    place(sim, 0, 0, 1);
    place(sim, 1, 180, -1);
    settle(sim);
    run(sim, 2, (t) => [t < 2 ? Btn.Heavy | Btn.Right : 0, 0]);
    let maxX = -Infinity;
    let returned = false;
    for (let i = 0; i < 70; i++) {
      sim.step([0, 0]);
      const d = sim.state.projectiles.find((p) => p.defId === 'rune_disc');
      if (!d) continue;
      maxX = Math.max(maxX, d.x);
      if (maxX > 60 && d.x < maxX - 40) returned = true;
    }
    expect(maxX).toBeGreaterThan(60);
    expect(returned).toBe(true);
  });

  it('dhampir phantom step teleports forward and is intangible mid-way', () => {
    const sim = duel('dhampir', 'knight');
    place(sim, 0, -60, 1);
    place(sim, 1, 150, -1);
    settle(sim);
    const x0 = sim.state.fighters[0].x;
    let sawIntangible = false;
    run(sim, 40, (t) => {
      const f = sim.state.fighters[0];
      if (isInvulnerable(f, sim.characterOf(f)) && f.state === 'attack') sawIntangible = true;
      return [t < 2 ? Btn.Heavy | Btn.Right : 0, 0];
    });
    expect(sawIntangible).toBe(true);
    expect(sim.state.fighters[0].x - x0).toBeGreaterThan(70);
  });

  it('vampire charged fireball is a big explosive orb', () => {
    const sim = duel('vampire', 'knight');
    place(sim, 0, -100, 1);
    place(sim, 1, 60, -1);
    settle(sim);
    const ev = run(sim, 120, (t) => [t < 2 ? Btn.Heavy : 0, 0]);
    expect(ev.some((e) => e.type === 'projectile_spawn' && e.defId === 'inferno_orb')).toBe(true);
    expect(ev.some((e) => e.type === 'explosion')).toBe(true);
    expect(hitsOn(ev, 1).length).toBeGreaterThan(0);
  });

  it('summoner cat runs along the floor and hits', () => {
    const sim = duel('summoner', 'knight');
    place(sim, 0, -100, 1);
    place(sim, 1, 40, -1);
    settle(sim);
    const ev = run(sim, 60, (t) => [t < 2 ? Btn.Heavy | Btn.Right : 0, 0]);
    const cat = ev.find((e) => e.type === 'projectile_spawn' && e.defId === 'cat');
    expect(cat).toBeDefined();
    expect(hitsOn(ev, 1).length).toBeGreaterThan(0);
  });

  it('new stages load and fighters stand on them', () => {
    for (const stageId of SEASONS[0].stages) {
      const sim = duel('summoner', 'vampire', stageId);
      run(sim, 30);
      for (const f of sim.state.fighters) expect(f.grounded, stageId).toBe(true);
    }
  });
});
