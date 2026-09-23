import { Btn, type InputFrame } from '../core/input';
import { rectsOverlap, toWorldRect, type Rect } from '../core/math';
import { chance, createRng, nextFloat, nextInt, type RngState } from '../core/rng';
import { launchSpeed } from '../combat/formulas';
import { isInvulnerable } from '../combat/hitboxes';
import { canUseAttack } from '../sim/fighter';
import type { Simulation } from '../sim/simulation';
import type { FighterState } from '../sim/types';
import { resolveSlot } from '../characters/moveset';
import { ATTACK_SLOTS, type AttackDefinition, type AttackSlot, type CharacterDefinition } from '../characters/types';
import { BOT_PROFILES, type BotDifficulty, type BotProfile } from './profiles';

/**
 * Bot = state machine that produces the same InputFrame a human would. It never touches the
 * simulation state directly, so it can't cheat (no instant turns, no ignoring cooldowns),
 * and the exact same controller can later run on the realtime server.
 *
 * Modes:
 *   neutral  – spacing, approaching, choosing attacks
 *   chase    – following up a hit (combo / juggle)
 *   evade    – reacting to an incoming attack (dodge / jump away)
 *   recover  – offstage: get back to the stage
 *   edgeguard– wait at the ledge for a recovering opponent
 */
export type BotMode = 'neutral' | 'chase' | 'evade' | 'recover' | 'edgeguard';

interface Observation {
  tick: number;
  index: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  state: FighterState['state'];
  attackId: string | null;
  attackFrame: number;
  damage: number;
  invulnerable: boolean;
  lastHitBy: number;
}

interface QueuedInput {
  input: InputFrame;
  ticks: number;
  /** Buttons in `input` that must be a fresh press (released on the previous tick). */
  taps: number;
}

const TAP_BUTTONS = Btn.Jump | Btn.Light | Btn.Heavy | Btn.Dodge;
const dirBits = (dirX: number, dirY = 0): InputFrame =>
  (dirX < 0 ? Btn.Left : dirX > 0 ? Btn.Right : 0) | (dirY < 0 ? Btn.Up : dirY > 0 ? Btn.Down : 0);

/** Union of an attack's hitboxes over its active frames, including the attack's own travel. */
export const computeAttackReach = (a: AttackDefinition, c: CharacterDefinition): Rect => {
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  let airborne = false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let frame = 0; frame < a.startup + a.active; frame++) {
    for (const m of a.movement ?? []) {
      if (m.frame !== frame) continue;
      const add = m.mode === 'add';
      if (m.vx !== undefined) vx = (add ? vx : 0) + m.vx;
      if (m.vy !== undefined) {
        vy = (add ? vy : 0) + m.vy;
        if (m.vy !== 0) airborne = true;
      }
    }
    if (!a.aerial) vx *= a.friction ?? 0.8;
    if (airborne) vy += c.gravity * (a.gravityScale ?? 1);
    x += vx;
    y += vy;
    const i = frame - a.startup;
    if (i < 0) continue;
    for (const h of a.hitboxes) {
      if (i < (h.from ?? 0) || i > (h.to ?? a.active - 1)) continue;
      minX = Math.min(minX, x + h.x);
      minY = Math.min(minY, y + h.y);
      maxX = Math.max(maxX, x + h.x + h.w);
      maxY = Math.max(maxY, y + h.y + h.h);
    }
  }
  // Projectiles: sweep their path for up to ~0.75 s of flight.
  const defs = new Map((c.projectiles ?? []).map((p) => [p.id, p]));
  for (const sp of a.projectiles ?? []) {
    const d = defs.get(sp.id);
    if (!d) continue;
    const add = (px: number, py: number, w: number, h: number) => {
      minX = Math.min(minX, px - w / 2);
      minY = Math.min(minY, py - h / 2);
      maxX = Math.max(maxX, px + w / 2);
      maxY = Math.max(maxY, py + h / 2);
    };
    if (d.grounded) {
      add(sp.x, -d.h / 2, d.w, d.h);
      continue;
    }
    if (d.attached || d.speed === 0) {
      add(sp.x, sp.y, d.w, d.h);
      continue;
    }
    const ang = ((sp.angle ?? d.angle) * Math.PI) / 180;
    let px = sp.x;
    let py = sp.y;
    let pvx = Math.cos(ang) * d.speed;
    let pvy = -Math.sin(ang) * d.speed;
    for (let t = 0; t < Math.min(d.lifetime, 45); t++) {
      pvy = (pvy + d.gravity) * (d.drag ?? 1);
      pvx *= d.drag ?? 1;
      px += pvx;
      py += pvy;
      if (t % 3 === 0) add(px, py, d.w, d.h);
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

const REACH_CACHE = new Map<string, Map<string, Rect>>();

/** Cached reach of any character's attack (the bot reads opponents' attacks too). */
export const reachOf = (c: CharacterDefinition, attackId: string): Rect | undefined => {
  let m = REACH_CACHE.get(c.id);
  if (!m) {
    m = new Map(c.attacks.map((a) => [a.id, computeAttackReach(a, c)]));
    REACH_CACHE.set(c.id, m);
  }
  return m.get(attackId);
};

interface Candidate {
  attack: AttackDefinition;
  input: InputFrame;
  button: number;
  score: number;
}

export class BotController {
  readonly index: number;
  readonly difficulty: BotDifficulty;
  readonly profile: BotProfile;
  private readonly rng: RngState;
  private readonly ledgeLeft: number;
  private readonly ledgeRight: number;
  private readonly stageTop: number;

  private history: Observation[] = [];
  private queue: QueuedInput[] = [];
  private lastOutput: InputFrame = 0;
  private lastDecisionTick = -1000;
  private handledThreat = '';
  private recoverDelay = 0;
  private offstageEpisode = false;
  mode: BotMode = 'neutral';

  constructor(sim: Simulation, index: number, difficulty: BotDifficulty, seed: number) {
    this.index = index;
    this.difficulty = difficulty;
    this.profile = BOT_PROFILES[difficulty];
    this.rng = createRng(seed ^ (index * 0x9e3779b1));

    const main = sim.stage.solids.reduce((best, s) => (s.y < best.y || (s.y === best.y && s.w > best.w) ? s : best));
    this.ledgeLeft = main.x;
    this.ledgeRight = main.x + main.w;
    this.stageTop = main.y;
  }

  think(sim: Simulation): InputFrame {
    const me = sim.state.fighters[this.index];
    const target = this.pickTarget(sim, me);
    if (target) this.observe(sim, target);

    if (sim.state.match.status !== 'running' || me.state === 'dead' || !target) {
      this.queue = [];
      this.mode = 'neutral';
      return this.emit(0);
    }

    const t = this.perceived();
    const c = sim.characterOf(me);

    // 1. Offstage overrides everything.
    if (this.isOffstage(sim, me)) {
      if (!this.offstageEpisode) {
        this.offstageEpisode = true;
        this.queue = [];
        this.recoverDelay = chance(this.rng, this.profile.recoverySkill) ? 0 : nextInt(this.rng, 15, 45);
      }
      this.mode = 'recover';
      return this.emit(this.recover(me));
    }
    this.offstageEpisode = false;
    if (this.mode === 'recover') this.mode = 'neutral';

    // Can't act: keep holding toward center so buffered inputs are sane.
    if (me.state === 'hitstun' || me.hitlag > 0) {
      this.queue = [];
      return this.emit(0);
    }

    // 2. React to incoming attacks (checked every tick, gated by reaction delay).
    if (t && this.checkThreat(sim, me, t)) return this.runQueue();
    if (this.checkProjectileThreat(sim, me)) return this.runQueue();

    if (this.queue.length > 0) return this.runQueue();

    // 3. Neutral decisions at the profile's cadence.
    if (sim.state.tick - this.lastDecisionTick >= this.profile.decisionInterval && t) {
      this.lastDecisionTick = sim.state.tick;
      this.decide(sim, me, c, t);
    }
    return this.runQueue();
  }

  // ── Perception ────────────────────────────────────────────────────────────

  private pickTarget(sim: Simulation, me: FighterState): FighterState | undefined {
    let best: FighterState | undefined;
    let bestD = Infinity;
    for (const f of sim.state.fighters) {
      if (f.team === me.team || f.state === 'dead') continue;
      const d = Math.abs(f.x - me.x) + Math.abs(f.y - me.y);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  private observe(sim: Simulation, f: FighterState) {
    this.history.push({
      tick: sim.state.tick,
      index: f.index,
      x: f.x,
      y: f.y,
      vx: f.vx,
      vy: f.vy,
      facing: f.facing,
      grounded: f.grounded,
      state: f.state,
      attackId: f.attack?.id ?? null,
      attackFrame: f.attack?.frame ?? -1,
      damage: f.damage,
      invulnerable: isInvulnerable(f, sim.characterOf(f)),
      lastHitBy: f.lastHitBy,
    });
    const keep = this.profile.reactionTicks + 2;
    if (this.history.length > keep) this.history.splice(0, this.history.length - keep);
  }

  /** What the bot "sees": the world `reactionTicks` ago. */
  private perceived(): Observation | undefined {
    const i = Math.max(0, this.history.length - 1 - this.profile.reactionTicks);
    return this.history[i];
  }

  private isOffstage(sim: Simulation, me: FighterState): boolean {
    if (me.grounded) return false;
    if (me.y > this.stageTop + 2) return true;
    return !this.groundBelow(sim, me.x, me.y);
  }

  private groundBelow(sim: Simulation, x: number, y: number): boolean {
    for (const s of sim.stage.solids) if (x >= s.x && x <= s.x + s.w && s.y >= y - 1) return true;
    for (const p of sim.stage.platforms) if (x >= p.x && x <= p.x + p.w && p.y >= y - 1) return true;
    return false;
  }

  // ── Output helpers ────────────────────────────────────────────────────────

  private push(input: InputFrame, ticks = 1, taps = input & TAP_BUTTONS) {
    this.queue.push({ input, ticks, taps });
  }

  private runQueue(): InputFrame {
    const q = this.queue[0];
    if (!q) return this.emit(0);
    // A tap needs a released frame first; spend this tick releasing.
    if (q.taps & this.lastOutput) return this.emit(q.input & ~q.taps);
    q.taps = 0;
    if (--q.ticks <= 0) this.queue.shift();
    return this.emit(q.input);
  }

  private emit(input: InputFrame): InputFrame {
    this.lastOutput = input;
    return input;
  }

  // ── Recovery ──────────────────────────────────────────────────────────────

  private recover(me: FighterState): InputFrame {
    const safeLeft = this.ledgeLeft + 28;
    const safeRight = this.ledgeRight - 28;
    const dir = me.x < safeLeft ? 1 : me.x > safeRight ? -1 : me.x < 0 ? 1 : -1;
    let input = dirBits(dir);

    if (me.state !== 'air') return input; // attacking/dodging/hitstun: just drift home
    if (this.recoverDelay > 0) {
      this.recoverDelay--;
      return input;
    }

    const belowLedge = me.y > this.stageTop - 10;
    const horiz = me.x < this.ledgeLeft ? this.ledgeLeft - me.x : me.x > this.ledgeRight ? me.x - this.ledgeRight : 0;
    const canTap = (btn: number) => (this.lastOutput & btn) === 0;

    if (me.wallContact === dir && me.wallJumps < 3 && belowLedge && canTap(Btn.Jump)) {
      input |= Btn.Jump;
    } else if (me.vy > 0.2 && (belowLedge || horiz > 50) && me.airJumps > 0 && canTap(Btn.Jump)) {
      input |= Btn.Jump;
    } else if (
      me.vy > 0 && !me.recoveryUsed && me.airJumps === 0 && me.y > this.stageTop - 50 && horiz < 120 && canTap(Btn.Heavy)
    ) {
      input |= Btn.Up | Btn.Heavy;
    } else if (
      this.difficulty !== 'easy' && me.airJumps === 0 && me.recoveryUsed && !me.airDodgeUsed &&
      me.dodgeCooldown === 0 && horiz > 16 && canTap(Btn.Dodge)
    ) {
      input |= Btn.Up | Btn.Dodge;
    }
    return input;
  }

  // ── Threat reaction ───────────────────────────────────────────────────────

  private checkProjectileThreat(sim: Simulation, me: FighterState): boolean {
    const c = sim.characterOf(me);
    const mine = c.hurtboxes.map((r) => toWorldRect(r, me.x, me.y, me.facing));
    const seenBefore = this.reactionTicks();
    for (const p of sim.state.projectiles) {
      if (p.team === me.team || p.stuck >= 0 || p.age < seenBefore) continue;
      const key = `p${p.uid}`;
      if (this.handledThreat === key) continue;
      const d = sim.projectileDef(p);
      let px = p.x;
      let py = p.y;
      let vx = p.vx;
      let vy = p.vy;
      let threat = false;
      for (let t = 0; t < 16 && !threat; t++) {
        const r = { x: px - d.w / 2 - 6, y: py - d.h / 2 - 6, w: d.w + 12, h: d.h + 12 };
        if (mine.some((m) => rectsOverlap(r, m))) threat = true;
        vy += d.gravity;
        px += vx;
        py += vy;
      }
      if (!threat) continue;
      this.handledThreat = key;
      if (!chance(this.rng, this.profile.dodgeSkill)) return false;
      this.mode = 'evade';
      this.queue = [];
      const canDodge = me.dodgeCooldown === 0 && (me.grounded || !me.airDodgeUsed);
      if (me.grounded && py > me.y - 24) this.push(Btn.Jump, 10);
      else if (canDodge) this.push(Btn.Dodge, 2);
      else this.push(dirBits(p.vx > 0 ? 1 : -1), 6);
      return true;
    }
    return false;
  }

  private reactionTicks(): number {
    return this.profile.reactionTicks;
  }

  private checkThreat(sim: Simulation, me: FighterState, t: Observation): boolean {
    if (t.state !== 'attack' || !t.attackId) return false;
    const key = `${t.index}:${t.attackId}:${t.tick - t.attackFrame}`;
    if (key === this.handledThreat) return false;

    const tf = sim.state.fighters[t.index];
    const a = sim.attacksOf(tf).get(t.attackId);
    if (!a) return false;
    const toActive = a.startup - t.attackFrame;
    if (toActive > 14 || t.attackFrame >= a.startup + a.active) return false;

    const reach = reachOf(sim.characterOf(tf), a.id);
    if (!reach) return false;
    const world = toWorldRect(reach, t.x, t.y, t.facing);
    const grown = { x: world.x - 8, y: world.y - 8, w: world.w + 16, h: world.h + 16 };
    const c = sim.characterOf(me);
    const mine = c.hurtboxes.map((r) => toWorldRect(r, me.x, me.y, me.facing));
    if (!mine.some((r) => rectsOverlap(grown, r))) return false;

    this.handledThreat = key;
    if (!chance(this.rng, this.profile.dodgeSkill)) return false;

    this.mode = 'evade';
    this.queue = [];
    const away = t.x < me.x ? 1 : -1;
    const canDodge = me.dodgeCooldown === 0 && (me.grounded || !me.airDodgeUsed);
    if (canDodge) {
      const rollEnd = me.x + away * 70;
      const rollSafe = !me.grounded || (rollEnd > this.ledgeLeft + 8 && rollEnd < this.ledgeRight - 8);
      this.push(dirBits(rollSafe ? away : 0, me.grounded ? 0 : -1) | Btn.Dodge, 2);
    } else if (me.grounded) {
      this.push(dirBits(away) | Btn.Jump, 12);
    } else {
      this.push(dirBits(away), 8);
    }
    return true;
  }

  // ── Neutral game ──────────────────────────────────────────────────────────

  private decide(sim: Simulation, me: FighterState, c: CharacterDefinition, t: Observation) {
    const p = this.profile;
    const dx = t.x - me.x;
    const adx = Math.abs(dx);
    const dy = t.y - me.y; // > 0: target below
    const toward: 1 | -1 = dx === 0 ? me.facing : dx > 0 ? 1 : -1;
    const actionable = me.state === 'idle' || me.state === 'run' || me.state === 'air';
    this.mode = 'neutral';

    // Mistakes: a whiffed button or a random hop.
    if (chance(this.rng, p.mistakeRate)) {
      const r = nextFloat(this.rng);
      if (r < 0.5) this.push(dirBits(toward) | Btn.Light, 2);
      else this.push(dirBits(r < 0.75 ? toward : -toward) | Btn.Jump, 8);
      return;
    }

    // Attack if something would connect.
    if (actionable && !t.invulnerable) {
      const candidates = this.candidates(sim, me, c, t);
      if (candidates.length > 0 && chance(this.rng, 0.35 + p.aggression * 0.65)) {
        candidates.sort((a, b) => b.score - a.score);
        const pick = chance(this.rng, p.accuracy)
          ? candidates[0]
          : candidates[nextInt(this.rng, 0, candidates.length - 1)];
        const hold = pick.attack.charge && adx > 110 ? nextInt(this.rng, 10, pick.attack.charge.maxTicks) : 2;
        this.push(pick.input | pick.button, hold);
        return;
      }
    }

    const targetFree = t.state !== 'hitstun';
    const chasing = !targetFree && t.lastHitBy === this.index && chance(this.rng, p.comboSkill);
    const targetOffstage = !t.grounded && (t.x < this.ledgeLeft - 4 || t.x > this.ledgeRight + 4 || t.y > this.stageTop + 2);

    let moveDir = 0;
    let jump = false;
    let drop = false;

    // Disarmed: the thrown weapon is stuck somewhere — go pick it up.
    if (me.weaponOut && !chasing) {
      const axe = sim.state.projectiles.find((pr) => pr.owner === this.index && pr.stuck >= 0);
      if (axe && Math.abs(axe.x) < this.ledgeRight + 20) {
        const dir = Math.abs(axe.x - me.x) > 4 ? Math.sign(axe.x - me.x) : 0;
        this.push(dirBits(dir) | (axe.y < me.y - 30 && me.grounded ? Btn.Jump : 0), 8, axe.y < me.y - 30 ? Btn.Jump : 0);
        return;
      }
    }

    if (chasing) {
      this.mode = 'chase';
      const px = t.x + t.vx * 8;
      moveDir = Math.abs(px - me.x) > 6 ? Math.sign(px - me.x) : 0;
      jump = dy < -28;
    } else if (targetOffstage && p.edgeGuard) {
      this.mode = 'edgeguard';
      const ledgeX = t.x < 0 ? this.ledgeLeft + 18 : this.ledgeRight - 18;
      moveDir = Math.abs(ledgeX - me.x) > 6 ? Math.sign(ledgeX - me.x) : 0;
    } else {
      const aggressive = chance(this.rng, p.aggression) && c.preferredRange === 'close';
      const rangeSpacing = c.preferredRange === 'far' ? 150 : c.preferredRange === 'mid' ? 95 : p.spacing;
      const desired = aggressive ? 16 : rangeSpacing;
      if (adx > desired + 8) moveDir = toward;
      else if (adx < desired - 14 && !aggressive) moveDir = -toward;
      // Ranged fighters cornered at close range hop away to reopen space.
      const hopTo = me.x - toward * 60;
      const hopSafe = hopTo > this.ledgeLeft + 16 && hopTo < this.ledgeRight - 16;
      if (c.preferredRange !== 'close' && hopSafe && adx < 36 && me.grounded && chance(this.rng, 0.25 + p.aggression * 0.3)) {
        this.push(dirBits(-toward) | Btn.Jump, 12);
        return;
      }
      jump = dy < -44 && chance(this.rng, 0.4 + p.aggression * 0.4);
      drop = dy > 30 && me.onPlatform;
    }

    // Don't walk off the main stage.
    if (me.grounded && !me.onPlatform && moveDir !== 0) {
      const next = me.x + moveDir * 14;
      if (next < this.ledgeLeft + 6 || next > this.ledgeRight - 6) moveDir = 0;
    }

    if (drop) {
      this.push(Btn.Down, 5, 0);
      return;
    }
    if (jump && (me.grounded || me.airJumps > 0) && me.vy >= -1) {
      this.push(dirBits(moveDir) | Btn.Jump, 14);
      return;
    }
    if (!me.grounded && dy > 24 && adx < 36 && me.vy > -0.5 && !me.fastFalling && chance(this.rng, 0.3)) {
      this.push(dirBits(moveDir, 1), 1, 0);
      return;
    }
    this.push(dirBits(moveDir), p.decisionInterval, 0);
  }

  /** Attacks that would connect against the perceived target from the current position. */
  private candidates(sim: Simulation, me: FighterState, c: CharacterDefinition, t: Observation): Candidate[] {
    const tf = sim.state.fighters[t.index];
    const tc = sim.characterOf(tf);
    const out: Candidate[] = [];
    const seen = new Set<string>();
    const airborne = !me.grounded;
    const toward: 1 | -1 = t.x === me.x ? me.facing : t.x > me.x ? 1 : -1;

    for (const slot of ATTACK_SLOTS) {
      if (slot.startsWith('air_') !== airborne) continue;
      const id = resolveSlot(c, slot);
      const a = id ? sim.attacksOf(me).get(id) : undefined;
      if (!a || !canUseAttack(me, a)) continue;

      const { facing, input } = this.slotInput(slot, me.facing, toward);
      if (facing === null) continue;
      const key = `${a.id}:${facing}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const lead = a.startup;
      const tx = t.x + t.vx * lead * 0.8;
      const ty = t.y + (t.grounded ? 0 : t.vy * lead * 0.6);
      const hurt = tc.hurtboxes.map((r) => toWorldRect(r, tx, ty, t.facing));
      const reach = toWorldRect(reachOf(c, a.id)!, me.x + me.vx * lead * 0.5, me.y, facing);
      if (!hurt.some((h) => rectsOverlap(reach, h))) continue;

      // Safety: don't lunge off the main stage.
      if (me.grounded && !me.onPlatform) {
        const endX = facing === 1 ? reach.x + reach.w : reach.x;
        if (a.range === 'long' && (endX < this.ledgeLeft - 10 || endX > this.ledgeRight + 10)) continue;
      }

      let score = 1 + a.damage * 0.06 - a.startup * 0.05;
      const launch = launchSpeed(a.knockback, t.damage + a.damage, tc.weight);
      if (t.damage > 80) score += launch * 0.25;
      if (t.state === 'hitstun') score += Math.max(0, 16 - a.startup) * 0.06;
      if (a.recoveryMove && me.grounded) score -= 0.8;
      if (t.state === 'attack' && a.startup > 10) score -= 0.6; // slow moves get stuffed
      out.push({ attack: a, input, button: slot.endsWith('heavy') ? Btn.Heavy : Btn.Light, score });
    }
    return out;
  }

  /** Direction bits needed to trigger `slot` while ending up facing the target. */
  private slotInput(slot: AttackSlot, facing: 1 | -1, toward: 1 | -1): { facing: 1 | -1 | null; input: InputFrame } {
    const dir = slot.replace('air_', '').split('_')[0];
    const airborne = slot.startsWith('air_');
    switch (dir) {
      case 'side':
        // Grounded side attacks turn; aerials also turn (reverse aerial).
        return { facing: toward, input: dirBits(toward) };
      case 'up':
        return { facing: toward, input: dirBits(toward, -1) };
      case 'down':
        return { facing: toward, input: dirBits(toward, 1) };
      default:
        // Neutral can't turn: only valid if already facing the target.
        return facing === toward || airborne ? { facing, input: 0 } : { facing: null, input: 0 };
    }
  }
}
