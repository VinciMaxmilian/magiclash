import { KO_CREDIT_TICKS, MAX_DAMAGE, RESPAWN_DELAY_TICKS, RESPAWN_INVULN_TICKS, TICK_RATE } from '../core/constants';
import { EMPTY_INPUT, sanitizeInput, type InputFrame } from '../core/input';
import { DEG, rectsOverlap, type Rect } from '../core/math';
import { createRng } from '../core/rng';
import { hitstopTicks, hitstunTicks, launchSpeed, launchVector } from '../combat/formulas';
import { isInvulnerable, worldHitboxes, worldHurtboxes } from '../combat/hitboxes';
import { indexAttacks } from '../characters/moveset';
import type {
  AttackDefinition,
  CharacterDefinition,
  KnockbackDefinition,
  ProjectileDefinition,
  ProjectileSpawn,
  StatusEffect,
} from '../characters/types';
import { getCharacter, getStage } from '../data';
import { bodyRect } from '../physics/collision';
import type { StageDefinition } from '../physics/stage';
import { chargeRatio, createFighter, updateFighter, type FighterContext } from './fighter';
import type { FighterState, MatchConfig, ProjectileState, SimEvent, SimState } from './types';

/** Everything needed to apply one hit, whatever produced it (melee, projectile, explosion). */
interface HitSource {
  attacker: number;
  /** Direction of the launch (attacker facing, projectile heading, blast side). */
  facing: 1 | -1;
  attackId: string;
  damage: number;
  knockback: KnockbackDefinition;
  hitstopBonus: number;
  hitstunMultiplier: number;
  status?: StatusEffect;
  /** Melee freezes the attacker too; projectiles don't. */
  freezeAttacker: boolean;
  box: Rect;
}

const scaleKb = (kb: KnockbackDefinition, k: number): KnockbackDefinition =>
  k === 1 ? kb : { base: kb.base * k, growth: kb.growth * k, angle: kb.angle };

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
  private readonly projectileIndex: Map<string, Map<string, ProjectileDefinition>> = new Map();

  constructor(config: MatchConfig) {
    if (config.fighters.length < 1 || config.fighters.length > 4) {
      throw new Error('A match needs between 1 and 4 fighters');
    }
    this.config = config;
    this.stage = getStage(config.stageId);
    this.chars = config.fighters.map((f) => getCharacter(f.characterId));
    for (const c of this.chars) {
      if (!this.attackIndex.has(c.id)) this.attackIndex.set(c.id, indexAttacks(c));
      if (!this.projectileIndex.has(c.id)) {
        this.projectileIndex.set(c.id, new Map((c.projectiles ?? []).map((p) => [p.id, p])));
      }
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
      projectiles: [],
      nextProjectileId: 1,
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

  projectileDef(p: ProjectileState): ProjectileDefinition {
    return this.projectileIndex.get(this.state.fighters[p.owner].characterId)!.get(p.defId)!;
  }

  projectileDefsOf(f: FighterState): Map<string, ProjectileDefinition> {
    return this.projectileIndex.get(f.characterId)!;
  }

  /** World-space hitbox of a projectile (explosion size while exploding). */
  projectileRect(p: ProjectileState): Rect {
    const d = this.projectileDef(p);
    const w = p.exploding > 0 && d.explosion ? d.explosion.w : d.w;
    const h = p.exploding > 0 && d.explosion ? d.explosion.h : d.h;
    return { x: p.x - w / 2, y: p.y - h / 2, w, h };
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

    const spawnProjectile = (f: FighterState, sp: ProjectileSpawn, charge: number) =>
      this.spawnProjectile(f, sp, charge, events);

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
        spawnProjectile,
      };
      updateFighter(f, sanitizeInput(inputs[f.index] ?? EMPTY_INPUT), ctx);
    }

    this.updateProjectiles(events);
    this.resolveHits(events);
    this.checkBlastZones(events);

    if (s.match.timeLeft > 0) s.match.timeLeft--;
    this.checkMatchEnd(events);
    return events;
  }

  // ── Projectiles ───────────────────────────────────────────────────────────

  private spawnProjectile(f: FighterState, sp: ProjectileSpawn, charge: number, events: SimEvent[]) {
    const def = this.projectileIndex.get(f.characterId)?.get(sp.id);
    if (!def) return;
    const atk = this.attackOf(f);
    const scale = (k: number | undefined) => (atk?.charge && k ? 1 + (k - 1) * charge : 1);
    const speed = def.speed * scale(atk?.charge?.speed);
    const x = f.x + sp.x * f.facing;
    let y = f.y + sp.y;
    if (def.grounded) {
      const floor = this.floorBelow(x, y);
      if (floor === null) return; // nothing to stand on: the column fizzles
      y = floor - def.h / 2;
    }
    const p: ProjectileState = {
      uid: this.state.nextProjectileId++,
      defId: def.id,
      owner: f.index,
      team: f.team,
      x,
      y,
      vx: Math.cos((sp.angle ?? def.angle) * DEG) * speed * f.facing,
      vy: -Math.sin((sp.angle ?? def.angle) * DEG) * speed,
      facing: f.facing,
      facingAtSpawn: f.facing,
      age: 0,
      stuck: -1,
      exploding: 0,
      hitsLeft: def.pierce ?? 1,
      hitTicks: {},
      charge,
      dmgMul: scale(atk?.charge?.damage),
      kbMul: scale(atk?.charge?.knockback),
      ox: sp.x,
      oy: sp.y,
      dead: false,
    };
    if (def.weapon) f.weaponOut = true;
    this.state.projectiles.push(p);
    events.push({ type: 'projectile_spawn', uid: p.uid, owner: f.index, defId: def.id, x, y });
  }

  /** Top of the nearest floor at or below (x, y), within 240 px. */
  private floorBelow(x: number, y: number): number | null {
    let best: number | null = null;
    for (const s of this.stage.solids) {
      if (x >= s.x && x <= s.x + s.w && s.y >= y - 4 && s.y - y < 240) best = best === null ? s.y : Math.min(best, s.y);
    }
    for (const p of this.stage.platforms) {
      if (x >= p.x && x <= p.x + p.w && p.y >= y - 4 && p.y - y < 240) best = best === null ? p.y : Math.min(best, p.y);
    }
    return best;
  }

  private endProjectile(p: ProjectileState, reason: 'hit' | 'stage' | 'expire', events: SimEvent[], picked = false) {
    if (p.dead) return;
    p.dead = true;
    const def = this.projectileDef(p);
    events.push({ type: 'projectile_end', uid: p.uid, defId: p.defId, reason, x: p.x, y: p.y });
    if (def.weapon) {
      const owner = this.state.fighters[p.owner];
      if (owner.weaponOut) {
        owner.weaponOut = false;
        events.push({ type: 'weapon_back', fighter: owner.index, picked });
      }
    }
  }

  private explode(p: ProjectileState, def: ProjectileDefinition, events: SimEvent[]) {
    if (!def.explosion || p.exploding > 0) return;
    p.exploding = def.explosion.ticks;
    p.vx = 0;
    p.vy = 0;
    p.hitTicks = {};
    p.hitsLeft = 99;
    events.push({ type: 'explosion', uid: p.uid, defId: p.defId, x: p.x, y: p.y });
  }

  private hitsSolid(p: ProjectileState, def: ProjectileDefinition): boolean {
    const r: Rect = { x: p.x - def.w / 4, y: p.y - def.h / 4, w: def.w / 2, h: def.h / 2 };
    return this.stage.solids.some((s) => rectsOverlap(r, s));
  }

  private updateProjectiles(events: SimEvent[]) {
    const s = this.state;
    const bz = this.stage.blastZone;
    for (const p of s.projectiles) {
      if (p.dead) continue;
      const def = this.projectileDef(p);
      const owner = s.fighters[p.owner];

      if (p.exploding > 0) {
        if (--p.exploding === 0) this.endProjectile(p, 'expire', events);
        continue;
      }
      if (p.stuck >= 0) {
        p.stuck++;
        // The owner picks the weapon back up by touching it.
        if (def.weapon && owner.state !== 'dead') {
          const oc = this.chars[owner.index];
          if (rectsOverlap(bodyRect(owner.x, owner.y, oc.body.w, oc.body.h), this.projectileRect(p))) {
            this.endProjectile(p, 'expire', events, true);
            continue;
          }
        }
        if (p.stuck >= (def.stuckLifetime ?? 0)) this.endProjectile(p, 'expire', events);
        continue;
      }

      p.age++;
      if (def.attached) {
        if (owner.state === 'dead' || owner.state === 'hitstun') {
          this.endProjectile(p, 'expire', events);
          continue;
        }
        p.x = owner.x + p.ox * owner.facing;
        p.y = owner.y + p.oy;
        p.facing = owner.facing;
      } else {
        const drag = def.drag ?? 1;
        p.vy = (p.vy + def.gravity) * drag;
        p.vx = p.vx * drag + (def.accelX ?? 0) * p.facingAtSpawn;
        p.x += p.vx;
        p.y += p.vy;
        // Boomerangs keep facing their thrower's direction while flying back.
        if (p.vx !== 0 && !def.accelX) p.facing = p.vx > 0 ? 1 : -1;
      }

      if (!def.attached && !def.grounded && def.onStage !== 'pass' && this.hitsSolid(p, def)) {
        if (def.onStage === 'stick') {
          p.stuck = 0;
          p.vx = 0;
          p.vy = 0;
          events.push({ type: 'projectile_end', uid: p.uid, defId: p.defId, reason: 'stage', x: p.x, y: p.y });
        } else if (def.onStage === 'explode') {
          this.explode(p, def, events);
        } else {
          this.endProjectile(p, 'stage', events);
        }
        continue;
      }

      const outside = p.x < bz.left || p.x > bz.right || p.y < bz.top || p.y > bz.bottom;
      if (outside) {
        this.endProjectile(p, 'expire', events);
      } else if (p.age >= def.lifetime) {
        if (def.explodeOnExpire) this.explode(p, def, events);
        else this.endProjectile(p, 'expire', events);
      }
    }
    s.projectiles = s.projectiles.filter((p) => !p.dead);
  }

  // ── Hits ──────────────────────────────────────────────────────────────────

  private resolveHits(events: SimEvent[]) {
    const s = this.state;
    const fighters = s.fighters;
    const hits: { source: HitSource; target: FighterState; after?: () => void }[] = [];

    // Melee
    for (const a of fighters) {
      if (a.state !== 'attack' || a.hitlag > 0) continue;
      const atk = this.attackOf(a)!;
      const boxes = worldHitboxes(a, atk);
      if (boxes.length === 0) continue;
      const r = chargeRatio(a, atk);
      const dmgMul = atk.charge ? 1 + (atk.charge.damage - 1) * r : 1;
      const kbMul = atk.charge ? 1 + (atk.charge.knockback - 1) * r : 1;
      for (const t of fighters) {
        if (t === a || t.team === a.team || a.attack!.hit.includes(t.index)) continue;
        const tc = this.chars[t.index];
        if (isInvulnerable(t, tc)) continue;
        const hurt = worldHurtboxes(t, tc);
        const box = boxes.find((b) => hurt.some((h) => rectsOverlap(b, h)));
        if (!box) continue;
        a.attack!.hit.push(t.index);
        hits.push({
          target: t,
          source: {
            attacker: a.index,
            facing: a.facing,
            attackId: atk.id,
            damage: Math.round(atk.damage * dmgMul),
            knockback: scaleKb(atk.knockback, kbMul),
            hitstopBonus: atk.hitstopBonus ?? 0,
            hitstunMultiplier: atk.hitstunMultiplier ?? 1,
            status: atk.status,
            freezeAttacker: true,
            box,
          },
        });
      }
    }

    // Projectiles and explosions
    for (const p of s.projectiles) {
      if (p.dead || p.stuck >= 0) continue;
      const def = this.projectileDef(p);
      const rect = this.projectileRect(p);
      const exploding = p.exploding > 0 && def.explosion;
      for (const t of fighters) {
        if (t.team === p.team || t.index === p.owner) continue;
        const tc = this.chars[t.index];
        if (isInvulnerable(t, tc)) continue;
        const last = p.hitTicks[t.index];
        if (last !== undefined && !(def.rehitInterval && s.tick - last >= def.rehitInterval)) continue;
        if (!worldHurtboxes(t, tc).some((h) => rectsOverlap(rect, h))) continue;
        p.hitTicks[t.index] = s.tick;
        const src: HitSource = exploding
          ? {
              attacker: p.owner,
              facing: t.x >= p.x ? 1 : -1,
              attackId: `${def.id}:blast`,
              damage: def.explosion!.damage,
              knockback: def.explosion!.knockback,
              hitstopBonus: def.hitstopBonus ?? 0,
              hitstunMultiplier: def.hitstunMultiplier ?? 1,
              status: def.status,
              freezeAttacker: false,
              box: rect,
            }
          : {
              attacker: p.owner,
              facing: p.facing,
              attackId: def.id,
              damage: Math.round(def.damage * p.dmgMul),
              knockback: scaleKb(def.knockback, p.kbMul),
              hitstopBonus: def.hitstopBonus ?? 0,
              hitstunMultiplier: def.hitstunMultiplier ?? 1,
              status: def.status,
              freezeAttacker: false,
              box: rect,
            };
        hits.push({
          target: t,
          source: src,
          after: () => {
            if (exploding) return;
            if (--p.hitsLeft <= 0) {
              if (def.explodeOnHit && def.explosion) {
                this.explode(p, def, events);
                p.hitTicks[t.index] = s.tick; // the blast doesn't double-hit the direct target
              } else {
                this.endProjectile(p, 'hit', events);
              }
            }
          },
        });
      }
    }

    // Collected first, applied after: simultaneous hits trade.
    for (const h of hits) {
      this.applyHit(h.source, h.target, events);
      h.after?.();
    }
    s.projectiles = s.projectiles.filter((p) => !p.dead);
  }

  private applyHit(src: HitSource, t: FighterState, events: SimEvent[]) {
    const tc = this.chars[t.index];
    const a = this.state.fighters[src.attacker];

    t.damage = Math.min(MAX_DAMAGE, t.damage + src.damage);
    const speed = launchSpeed(src.knockback, t.damage, tc.weight);
    const vec = launchVector(src.knockback.angle, speed, src.facing, t.grounded);
    const stop = hitstopTicks(src.damage, src.hitstopBonus);

    t.state = 'hitstun';
    t.stateTicks = 0;
    t.attack = null;
    t.hitstun = hitstunTicks(speed, tc.hitstunMultiplier * src.hitstunMultiplier);
    t.hitlag = stop;
    t.pendingLaunch = vec;
    t.vx = 0;
    t.vy = 0;
    t.fastFalling = false;
    t.recoveryUsed = false; // getting hit gives the recovery move back
    t.lastHitBy = a.index;
    t.lastHitTick = this.state.tick;
    t.stats.damageTaken += src.damage;
    if (src.status?.kind === 'slow') {
      t.slowTicks = Math.max(t.slowTicks, src.status.ticks);
      t.slowFactor = Math.min(t.slowFactor, src.status.factor);
    }

    if (src.freezeAttacker) a.hitlag = Math.max(a.hitlag, stop);
    a.stats.damageDealt += src.damage;
    a.stats.hitsLanded++;

    // Impact point: center of the overlap between the hitbox and the target's body.
    const box = src.box;
    const cx = Math.max(box.x, t.x - tc.body.w / 2) + Math.min(box.x + box.w, t.x + tc.body.w / 2);
    const cy = Math.max(box.y, t.y - tc.body.h) + Math.min(box.y + box.h, t.y);
    events.push({
      type: 'hit',
      attacker: a.index,
      target: t.index,
      attackId: src.attackId,
      damage: src.damage,
      launch: speed,
      angle: Math.atan2(vec.vy, vec.vx),
      x: cx / 2,
      y: cy / 2,
      hitstop: stop,
    });
  }

  // ── Eliminations and match rules ──────────────────────────────────────────

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
      f.slowTicks = 0;
      f.slowFactor = 1;
      f.respawnTimer = RESPAWN_DELAY_TICKS;
      // Attached beams vanish with their caster.
      for (const p of s.projectiles) {
        if (p.owner === f.index && this.projectileDef(p).attached) this.endProjectile(p, 'expire', events);
      }
    }
    s.projectiles = s.projectiles.filter((p) => !p.dead);
  }

  private updateDead(f: FighterState, events: SimEvent[]) {
    f.stateTicks++;
    if (f.stocks <= 0 || this.state.match.status !== 'running') return;
    if (--f.respawnTimer > 0) return;
    const p = this.stage.respawns[f.index % this.stage.respawns.length];
    const c = this.chars[f.index];
    // A new life comes with the weapon in hand.
    for (const pr of this.state.projectiles) {
      if (pr.owner === f.index && this.projectileDef(pr).weapon) this.endProjectile(pr, 'expire', events);
    }
    this.state.projectiles = this.state.projectiles.filter((pr) => !pr.dead);
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
      weaponOut: false,
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
