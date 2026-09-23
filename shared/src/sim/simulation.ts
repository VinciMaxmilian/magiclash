import { KO_CREDIT_TICKS, MAX_DAMAGE, RESPAWN_DELAY_TICKS, RESPAWN_INVULN_TICKS, TICK_RATE } from '../core/constants';
import { EMPTY_INPUT, sanitizeInput, type InputFrame } from '../core/input';
import { rectsOverlap, type Rect } from '../core/math';
import { createRng } from '../core/rng';
import { hitstopTicks, hitstunTicks, launchSpeed, launchVector } from '../combat/formulas';
import { isInvulnerable, worldHitboxes, worldHurtboxes } from '../combat/hitboxes';
import { indexAttacks } from '../characters/moveset';
import type { AttackDefinition, CharacterDefinition } from '../characters/types';
import { getCharacter, getStage } from '../data';
import type { StageDefinition } from '../physics/stage';
import { createFighter, updateFighter, type FighterContext } from './fighter';
import type { FighterState, MatchConfig, SimEvent, SimState } from './types';

interface PendingHit {
  attacker: FighterState;
  target: FighterState;
  attack: AttackDefinition;
  box: Rect;
}

/**
 * Deterministic fixed-step simulation. Same config + same input sequence ⇒ same state,
 * on any machine. This class is what the realtime server will run authoritatively.
 */
export class Simulation {
  readonly config: MatchConfig;
  readonly stage: StageDefinition;
  state: SimState;
  private readonly chars: CharacterDefinition[];
  private readonly attackIndex: Map<string, Map<string, AttackDefinition>> = new Map();

  constructor(config: MatchConfig) {
    if (config.fighters.length < 1 || config.fighters.length > 4) {
      throw new Error('A match needs between 1 and 4 fighters');
    }
    this.config = config;
    this.stage = getStage(config.stageId);
    this.chars = config.fighters.map((f) => getCharacter(f.characterId));
    for (const c of this.chars) {
      if (!this.attackIndex.has(c.id)) this.attackIndex.set(c.id, indexAttacks(c));
    }

    const countdown = config.countdownTicks ?? 3 * TICK_RATE;
    this.state = {
      tick: 0,
      stageId: config.stageId,
      rng: createRng(config.seed),
      fighters: config.fighters.map((setup, i) => {
        const spawn = this.stage.spawns[i % this.stage.spawns.length];
        return createFighter(
          i,
          setup.characterId,
          setup.team,
          setup.name,
          spawn.x,
          spawn.y,
          spawn.facing,
          config.stocks,
          this.chars[i].maxAirJumps,
        );
      }),
      match: {
        status: countdown > 0 ? 'countdown' : 'running',
        countdown,
        timeLeft: config.timeLimit > 0 ? Math.round(config.timeLimit * TICK_RATE) : -1,
        winnerTeam: null,
        endTick: -1,
      },
    };
  }

  characterOf(f: FighterState): CharacterDefinition {
    return this.chars[f.index];
  }

  attackOf(f: FighterState): AttackDefinition | undefined {
    return f.attack ? this.attackIndex.get(f.characterId)!.get(f.attack.id) : undefined;
  }

  attacksOf(f: FighterState): Map<string, AttackDefinition> {
    return this.attackIndex.get(f.characterId)!;
  }

  /** Advance one tick. `inputs[i]` belongs to fighter i. Returns events for effects/audio. */
  step(inputs: readonly InputFrame[]): SimEvent[] {
    const s = this.state;
    const events: SimEvent[] = [];
    s.tick++;

    if (s.match.status === 'ended') return events;

    if (s.match.status === 'countdown') {
      if (s.match.countdown % TICK_RATE === 0) {
        events.push({ type: 'countdown', value: s.match.countdown / TICK_RATE });
      }
      s.match.countdown--;
      if (s.match.countdown <= 0) {
        s.match.status = 'running';
        events.push({ type: 'match_start' });
      }
      // Fighters idle in place; remember held inputs so a held button doesn't fire on GO.
      s.fighters.forEach((f, i) => (f.prevInput = sanitizeInput(inputs[i] ?? EMPTY_INPUT)));
      return events;
    }

    for (const f of s.fighters) {
      if (f.state === 'dead') {
        this.updateDead(f, events);
        continue;
      }
      const ctx: FighterContext = {
        c: this.chars[f.index],
        attacks: this.attackIndex.get(f.characterId)!,
        stage: this.stage,
        tick: s.tick,
        events,
      };
      updateFighter(f, sanitizeInput(inputs[f.index] ?? EMPTY_INPUT), ctx);
    }

    this.resolveHits(events);
    this.checkBlastZones(events);

    if (s.match.timeLeft > 0) s.match.timeLeft--;
    this.checkMatchEnd(events);
    return events;
  }

  private resolveHits(events: SimEvent[]) {
    const fighters = this.state.fighters;
    const hits: PendingHit[] = [];

    for (const a of fighters) {
      if (a.state !== 'attack' || a.hitlag > 0) continue;
      const atk = this.attackOf(a)!;
      const boxes = worldHitboxes(a, atk);
      if (boxes.length === 0) continue;
      for (const t of fighters) {
        if (t === a || t.team === a.team || a.attack!.hit.includes(t.index)) continue;
        const tc = this.chars[t.index];
        if (isInvulnerable(t, tc)) continue;
        const hurt = worldHurtboxes(t, tc);
        const box = boxes.find((b) => hurt.some((h) => rectsOverlap(b, h)));
        if (box) hits.push({ attacker: a, target: t, attack: atk, box });
      }
    }

    // Collected first, applied after: simultaneous hits trade.
    for (const h of hits) this.applyHit(h, events);
  }

  private applyHit({ attacker: a, target: t, attack: atk, box }: PendingHit, events: SimEvent[]) {
    const tc = this.chars[t.index];
    a.attack?.hit.push(t.index);

    t.damage = Math.min(MAX_DAMAGE, t.damage + atk.damage);
    const speed = launchSpeed(atk.knockback, t.damage, tc.weight);
    const vec = launchVector(atk.knockback.angle, speed, a.facing, t.grounded);
    const stop = hitstopTicks(atk.damage, atk.hitstopBonus ?? 0);

    t.state = 'hitstun';
    t.stateTicks = 0;
    t.attack = null;
    t.hitstun = hitstunTicks(speed, tc.hitstunMultiplier);
    t.hitlag = stop;
    t.pendingLaunch = vec;
    t.vx = 0;
    t.vy = 0;
    t.fastFalling = false;
    t.recoveryUsed = false; // getting hit gives the recovery move back
    t.lastHitBy = a.index;
    t.lastHitTick = this.state.tick;
    t.stats.damageTaken += atk.damage;

    a.hitlag = Math.max(a.hitlag, stop);
    a.stats.damageDealt += atk.damage;
    a.stats.hitsLanded++;

    // Impact point: center of the overlap between hitbox and the target's body.
    const cx = Math.max(box.x, t.x - tc.body.w / 2) + Math.min(box.x + box.w, t.x + tc.body.w / 2);
    const cy = Math.max(box.y, t.y - tc.body.h) + Math.min(box.y + box.h, t.y);
    events.push({
      type: 'hit',
      attacker: a.index,
      target: t.index,
      attackId: atk.id,
      damage: atk.damage,
      launch: speed,
      angle: Math.atan2(vec.vy, vec.vx),
      x: cx / 2,
      y: cy / 2,
      hitstop: stop,
    });
  }

  private checkBlastZones(events: SimEvent[]) {
    const bz = this.stage.blastZone;
    const s = this.state;
    for (const f of s.fighters) {
      if (f.state === 'dead') continue;
      if (f.x >= bz.left && f.x <= bz.right && f.y >= bz.top && f.y <= bz.bottom) continue;

      const credited = f.lastHitBy >= 0 && s.tick - f.lastHitTick <= KO_CREDIT_TICKS;
      if (credited) s.fighters[f.lastHitBy].stats.kos++;
      else f.stats.selfDestructs++;
      f.stats.falls++;
      f.stocks = Math.max(0, f.stocks - 1);
      events.push({
        type: 'ko',
        fighter: f.index,
        by: credited ? f.lastHitBy : -1,
        x: Math.min(Math.max(f.x, bz.left), bz.right),
        y: Math.min(Math.max(f.y, bz.top), bz.bottom),
      });
      f.state = 'dead';
      f.stateTicks = 0;
      f.attack = null;
      f.vx = 0;
      f.vy = 0;
      f.hitlag = 0;
      f.hitstun = 0;
      f.pendingLaunch = null;
      f.respawnTimer = RESPAWN_DELAY_TICKS;
    }
  }

  private updateDead(f: FighterState, events: SimEvent[]) {
    f.stateTicks++;
    if (f.stocks <= 0 || this.state.match.status !== 'running') return;
    if (--f.respawnTimer > 0) return;
    const p = this.stage.respawns[f.index % this.stage.respawns.length];
    const c = this.chars[f.index];
    Object.assign(f, {
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      damage: 0,
      grounded: false,
      onPlatform: false,
      state: 'air',
      stateTicks: 0,
      airJumps: c.maxAirJumps,
      wallJumps: 0,
      recoveryUsed: false,
      airDodgeUsed: false,
      fastFalling: false,
      invuln: RESPAWN_INVULN_TICKS,
      lastHitBy: -1,
      lastHitTick: -1,
      cooldowns: {},
      dodgeCooldown: 0,
      landingLag: 0,
    } satisfies Partial<FighterState>);
    events.push({ type: 'respawn', fighter: f.index });
  }

  private checkMatchEnd(events: SimEvent[]) {
    const s = this.state;
    const aliveTeams = new Set(s.fighters.filter((f) => f.stocks > 0).map((f) => f.team));
    const teamCount = new Set(s.fighters.map((f) => f.team)).size;
    let winner: number | null = null;

    if (teamCount > 1 && aliveTeams.size <= 1) {
      winner = aliveTeams.size === 1 ? [...aliveTeams][0] : -1;
    } else if (s.match.timeLeft === 0) {
      winner = this.decideOnTime();
    }
    if (winner === null) return;
    s.match.status = 'ended';
    s.match.winnerTeam = winner;
    s.match.endTick = s.tick;
    events.push({ type: 'match_end', winnerTeam: winner });
  }

  /** Time out: most stocks wins, then lowest damage. Exact tie = draw (-1). */
  private decideOnTime(): number {
    const byTeam = new Map<number, { stocks: number; damage: number }>();
    for (const f of this.state.fighters) {
      const t = byTeam.get(f.team) ?? { stocks: 0, damage: 0 };
      t.stocks += f.stocks;
      t.damage += f.stocks > 0 ? f.damage : 0;
      byTeam.set(f.team, t);
    }
    const ranked = [...byTeam.entries()].sort(
      (a, b) => b[1].stocks - a[1].stocks || a[1].damage - b[1].damage,
    );
    const [first, second] = ranked;
    if (second && first[1].stocks === second[1].stocks && first[1].damage === second[1].damage) return -1;
    return first[0];
  }

  /** Stable string of the full state — used by determinism tests and (later) desync checks. */
  hash(): string {
    return JSON.stringify(this.state, (_k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
  }
}
