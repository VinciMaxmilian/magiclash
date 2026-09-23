import { approach } from '../core/math';
import { Btn, held, horizontalAxis, pressed, released, verticalAxis, type InputFrame } from '../core/input';
import {
  COYOTE_TICKS,
  DROP_THROUGH_HOLD_TICKS,
  DROP_THROUGH_IGNORE_TICKS,
  INPUT_BUFFER_TICKS,
} from '../core/constants';
import { COMBAT } from '../combat/formulas';
import { moveAndCollide } from '../physics/collision';
import type { StageDefinition } from '../physics/stage';
import { resolveSlot, slotFor } from '../characters/moveset';
import { attackTotalFrames, type AttackDefinition, type CharacterDefinition } from '../characters/types';
import type { FighterState, FighterStats, SimEvent } from './types';

export const MAX_WALL_JUMPS = 3;
const WALL_CLING_FALL_SPEED = 1.4;

export interface FighterContext {
  c: CharacterDefinition;
  attacks: Map<string, AttackDefinition>;
  stage: StageDefinition;
  tick: number;
  events: SimEvent[];
}

export const emptyStats = (): FighterStats => ({
  kos: 0,
  falls: 0,
  selfDestructs: 0,
  damageDealt: 0,
  damageTaken: 0,
  hitsLanded: 0,
});

export const createFighter = (
  index: number,
  characterId: string,
  team: number,
  name: string,
  x: number,
  y: number,
  facing: 1 | -1,
  stocks: number,
  maxAirJumps: number,
): FighterState => ({
  index,
  characterId,
  team,
  name,
  x,
  y,
  vx: 0,
  vy: 0,
  facing,
  grounded: true,
  onPlatform: false,
  wallContact: 0,
  state: 'idle',
  stateTicks: 0,
  attack: null,
  damage: 0,
  stocks,
  airJumps: maxAirJumps,
  wallJumps: 0,
  recoveryUsed: false,
  airDodgeUsed: false,
  fastFalling: false,
  jumpCutAvailable: false,
  coyote: 0,
  downHeldTicks: 0,
  dropThroughTicks: 0,
  hitstun: 0,
  hitlag: 0,
  pendingLaunch: null,
  landingLag: 0,
  dodgeTicks: 0,
  dodgeCooldown: 0,
  invuln: 0,
  cooldowns: {},
  prevInput: 0,
  buffer: { light: 0, heavy: 0, jump: 0, dodge: 0 },
  lastHitBy: -1,
  lastHitTick: -1,
  respawnTimer: 0,
  stats: emptyStats(),
});

const setState = (f: FighterState, s: FighterState['state']) => {
  if (f.state !== s) {
    f.state = s;
    f.stateTicks = 0;
  }
};

const updateBuffers = (f: FighterState, input: InputFrame) => {
  const b = f.buffer;
  const p = f.prevInput;
  b.light = pressed(input, p, Btn.Light) ? INPUT_BUFFER_TICKS : Math.max(0, b.light - 1);
  b.heavy = pressed(input, p, Btn.Heavy) ? INPUT_BUFFER_TICKS : Math.max(0, b.heavy - 1);
  b.jump = pressed(input, p, Btn.Jump) ? INPUT_BUFFER_TICKS : Math.max(0, b.jump - 1);
  b.dodge = pressed(input, p, Btn.Dodge) ? INPUT_BUFFER_TICKS : Math.max(0, b.dodge - 1);
};

const tickTimers = (f: FighterState) => {
  if (f.invuln > 0) f.invuln--;
  if (f.dodgeCooldown > 0) f.dodgeCooldown--;
  if (f.coyote > 0) f.coyote--;
  if (f.dropThroughTicks > 0) f.dropThroughTicks--;
  for (const k in f.cooldowns) {
    if (f.cooldowns[k] > 0) f.cooldowns[k]--;
  }
};

export const canUseAttack = (f: FighterState, a: AttackDefinition): boolean =>
  (f.cooldowns[a.id] ?? 0) === 0 && !(a.recoveryMove && f.recoveryUsed);

const startAttack = (f: FighterState, a: AttackDefinition, ctx: FighterContext) => {
  f.attack = { id: a.id, frame: -1, hit: [] };
  f.fastFalling = false;
  if (a.recoveryMove) f.recoveryUsed = true;
  setState(f, 'attack');
  ctx.events.push({ type: 'attack_start', fighter: f.index, attackId: a.id });
  runAttack(f, 0, ctx); // processes frame 0 immediately
};

/** Returns true if an attack was started. */
const tryAttack = (f: FighterState, input: InputFrame, heavy: boolean, ctx: FighterContext): boolean => {
  const dirX = horizontalAxis(input);
  const dirY = verticalAxis(input);
  const airborne = !f.grounded;
  const id = resolveSlot(ctx.c, slotFor(airborne, heavy, dirX, dirY));
  const a = id ? ctx.attacks.get(id) : undefined;
  if (!a || !canUseAttack(f, a)) return false;
  // Side attacks (and any grounded attack) turn toward the held direction.
  if (dirX !== 0) f.facing = dirX;
  startAttack(f, a, ctx);
  return true;
};

const startDodge = (f: FighterState, input: InputFrame, ctx: FighterContext) => {
  const d = ctx.c.dodge;
  const dirX = horizontalAxis(input);
  const dirY = verticalAxis(input);
  if (f.grounded) {
    f.vx = dirX * d.speed;
    f.vy = 0;
  } else {
    const diag = dirX !== 0 && dirY !== 0 ? Math.SQRT1_2 : 1;
    f.vx = dirX * d.speed * diag;
    f.vy = dirY * d.speed * diag;
    f.airDodgeUsed = true;
    f.fastFalling = false;
  }
  f.dodgeTicks = 0;
  f.attack = null;
  setState(f, 'dodge');
  ctx.events.push({ type: 'dodge', fighter: f.index });
};

const tryJump = (f: FighterState, input: InputFrame, ctx: FighterContext): boolean => {
  const c = ctx.c;
  if (f.grounded || f.coyote > 0) {
    f.vy = -c.jumpForce;
    f.grounded = false;
    f.onPlatform = false;
    f.coyote = 0;
    f.jumpCutAvailable = true;
    f.fastFalling = false;
    setState(f, 'air');
    ctx.events.push({ type: 'jump', fighter: f.index, kind: 'ground' });
    return true;
  }
  const dirX = horizontalAxis(input);
  if (f.wallContact !== 0 && dirX === f.wallContact && f.wallJumps < MAX_WALL_JUMPS) {
    f.vy = -c.airJumpForce * 0.95;
    f.vx = -f.wallContact * 3.2;
    f.facing = f.wallContact === 1 ? -1 : 1;
    f.wallJumps++;
    f.jumpCutAvailable = false;
    f.fastFalling = false;
    ctx.events.push({ type: 'jump', fighter: f.index, kind: 'wall' });
    return true;
  }
  if (f.airJumps > 0) {
    f.airJumps--;
    f.vy = -c.airJumpForce;
    if (dirX !== 0) f.vx = dirX * c.airSpeed * 0.8;
    f.jumpCutAvailable = false;
    f.fastFalling = false;
    ctx.events.push({ type: 'jump', fighter: f.index, kind: 'air' });
    return true;
  }
  return false;
};

/** Advances an attack by one frame. `input` is only used for chains and aerial drift. */
const runAttack = (f: FighterState, input: InputFrame, ctx: FighterContext) => {
  const inst = f.attack!;
  const a = ctx.attacks.get(inst.id)!;
  inst.frame++;

  const lastActive = a.startup + a.active - 1;
  if (a.untilLanding && inst.frame > lastActive && !f.grounded) inst.frame = lastActive;

  for (const m of a.movement ?? []) {
    if (m.frame !== inst.frame) continue;
    const add = m.mode === 'add';
    if (m.vx !== undefined) f.vx = (add ? f.vx : 0) + m.vx * f.facing;
    if (m.vy !== undefined) {
      f.vy = (add ? f.vy : 0) + m.vy;
      if (m.vy < 0) {
        f.grounded = false;
        f.onPlatform = false;
      }
    }
  }

  if (a.aerial && !f.grounded) {
    const dirX = horizontalAxis(input);
    if (dirX !== 0) f.vx = approach(f.vx, dirX * ctx.c.airSpeed, ctx.c.airAccel * 0.6);
  } else {
    f.vx *= a.friction ?? 0.8;
  }

  if (a.chain && f.buffer.light > 0 && inst.frame >= a.chain.from && inst.frame <= a.chain.to) {
    const next = ctx.attacks.get(a.chain.next);
    if (next && canUseAttack(f, next)) {
      f.buffer.light = 0;
      f.cooldowns[a.id] = a.cooldown;
      startAttack(f, next, ctx);
      return;
    }
  }

  if (inst.frame >= attackTotalFrames(a)) {
    f.cooldowns[a.id] = a.cooldown;
    f.attack = null;
    setState(f, f.grounded ? 'idle' : 'air');
  }
};

const updateActionable = (f: FighterState, input: InputFrame, ctx: FighterContext) => {
  const c = ctx.c;
  const dirX = horizontalAxis(input);
  const b = f.buffer;

  // Priority: dodge > attack > jump. Buffered presses survive a few ticks of lag.
  if (b.dodge > 0 && f.dodgeCooldown === 0 && (f.grounded || !f.airDodgeUsed)) {
    b.dodge = 0;
    startDodge(f, input, ctx);
    return;
  }
  if (b.heavy > 0 && tryAttack(f, input, true, ctx)) {
    b.heavy = 0;
    return;
  }
  if (b.light > 0 && tryAttack(f, input, false, ctx)) {
    b.light = 0;
    return;
  }
  if (b.jump > 0 && tryJump(f, input, ctx)) {
    b.jump = 0;
  }

  if (f.grounded) {
    if (dirX !== 0) {
      f.facing = dirX;
      f.vx = approach(f.vx, dirX * c.moveSpeed, c.groundAccel);
      setState(f, 'run');
    } else {
      f.vx = approach(f.vx, 0, c.groundFriction);
      setState(f, 'idle');
    }
    // Drop through one-way platforms by holding DOWN (short hold keeps down-light usable).
    if (f.onPlatform && held(input, Btn.Down) && !held(input, Btn.Light) && !held(input, Btn.Heavy)) {
      f.downHeldTicks++;
      if (f.downHeldTicks >= DROP_THROUGH_HOLD_TICKS) {
        f.grounded = false;
        f.onPlatform = false;
        f.dropThroughTicks = DROP_THROUGH_IGNORE_TICKS;
        f.downHeldTicks = 0;
        f.vy = 1;
        setState(f, 'air');
      }
    } else {
      f.downHeldTicks = 0;
    }
  } else {
    setState(f, 'air');
    if (dirX !== 0) f.vx = approach(f.vx, dirX * c.airSpeed, c.airAccel);
    else f.vx = approach(f.vx, 0, c.airFriction);
    if (pressed(input, f.prevInput, Btn.Down) && f.vy > -1.5) {
      f.fastFalling = true;
      f.vy = Math.max(f.vy, c.fastFallSpeed * 0.75);
    }
    if (released(input, f.prevInput, Btn.Jump) && f.jumpCutAvailable && f.vy < 0) {
      f.vy *= c.jumpCutMultiplier;
      f.jumpCutAvailable = false;
    }
  }
};

const onLand = (f: FighterState, impactVy: number, ctx: FighterContext) => {
  const c = ctx.c;
  const wasAirborne = !f.grounded;
  f.grounded = true;
  f.fastFalling = false;
  f.airJumps = c.maxAirJumps;
  f.wallJumps = 0;
  f.recoveryUsed = false;
  f.airDodgeUsed = false;
  f.jumpCutAvailable = false;
  if (!wasAirborne) return;

  if (f.state === 'attack' && f.attack) {
    const a = ctx.attacks.get(f.attack.id)!;
    if (a.aerial || a.recoveryMove || a.untilLanding) {
      f.cooldowns[a.id] = a.cooldown;
      f.attack = null;
      if ((a.landingLag ?? 0) > 0) {
        f.landingLag = a.landingLag!;
        setState(f, 'landing');
      } else {
        setState(f, 'idle');
      }
    }
  } else if (f.state === 'air') {
    setState(f, 'idle');
  }
  ctx.events.push({ type: 'land', fighter: f.index, speed: impactVy });
};

const physics = (f: FighterState, input: InputFrame, ctx: FighterContext) => {
  const c = ctx.c;
  let gravityScale = 1;
  if (f.state === 'attack' && f.attack) gravityScale = ctx.attacks.get(f.attack.id)!.gravityScale ?? 1;
  else if (f.state === 'dodge' && !f.grounded) gravityScale = 0;
  else if (f.state === 'hitstun') gravityScale = COMBAT.launchGravityScale;

  if (f.grounded) {
    // Small downward push re-lands every tick; if nothing is below, we walked off.
    f.vy = c.gravity;
  } else {
    f.vy += c.gravity * gravityScale;
  }

  if (f.state === 'hitstun' && !f.grounded) {
    f.vx *= COMBAT.launchDrag;
    if (f.vy < 0) f.vy *= COMBAT.launchDrag;
    else if (f.vy > c.maxFallSpeed) f.vy = Math.max(c.maxFallSpeed, f.vy * COMBAT.launchDrag);
  } else if (!f.grounded) {
    let maxFall = f.fastFalling ? c.fastFallSpeed : c.maxFallSpeed;
    const clinging = f.wallContact !== 0 && horizontalAxis(input) === f.wallContact && f.state === 'air';
    if (clinging && f.vy > 0) maxFall = WALL_CLING_FALL_SPEED;
    if (f.vy > maxFall) f.vy = maxFall;
  }

  const wasGrounded = f.grounded;
  const res = moveAndCollide(f, c.body.w, c.body.h, ctx.stage, f.dropThroughTicks > 0);
  f.wallContact = res.wall;

  if (f.state === 'hitstun' && res.wall !== 0 && Math.abs(res.impactVx) > COMBAT.bounceSpeed) {
    f.vx = -res.impactVx * COMBAT.bounceRestitution;
    ctx.events.push({ type: 'bounce', fighter: f.index, x: f.x, y: f.y - c.body.h / 2 });
  }

  if (res.landed) {
    f.onPlatform = res.onPlatform;
    if (f.state === 'hitstun' && !wasGrounded && res.impactVy > COMBAT.bounceSpeed) {
      f.vy = -res.impactVy * COMBAT.bounceRestitution;
      f.grounded = false;
      ctx.events.push({ type: 'bounce', fighter: f.index, x: f.x, y: f.y });
      return;
    }
    onLand(f, res.impactVy, ctx);
  } else if (f.grounded) {
    // Walked off an edge.
    f.grounded = false;
    f.onPlatform = false;
    f.coyote = f.state === 'run' || f.state === 'idle' ? COYOTE_TICKS : 0;
    f.vy = 0;
    if (f.state === 'idle' || f.state === 'run') setState(f, 'air');
  }
};

/**
 * One simulation tick for a living fighter: input buffering → state machine → physics.
 * Hit detection happens afterwards in the Simulation (needs all fighters).
 */
export const updateFighter = (f: FighterState, input: InputFrame, ctx: FighterContext): void => {
  updateBuffers(f, input);

  if (f.hitlag > 0) {
    // Frozen by hitstop. Inputs are still buffered.
    f.hitlag--;
    if (f.hitlag === 0 && f.pendingLaunch) {
      f.vx = f.pendingLaunch.vx;
      f.vy = f.pendingLaunch.vy;
      if (f.vy < 0) {
        f.grounded = false;
        f.onPlatform = false;
      }
      f.pendingLaunch = null;
    }
    f.prevInput = input;
    return;
  }

  tickTimers(f);
  f.stateTicks++;

  switch (f.state) {
    case 'hitstun':
      f.hitstun--;
      if (f.grounded) f.vx = approach(f.vx, 0, ctx.c.groundFriction * 0.5);
      if (f.hitstun <= 0) setState(f, f.grounded ? 'idle' : 'air');
      break;
    case 'landing':
      f.vx = approach(f.vx, 0, ctx.c.groundFriction);
      f.landingLag--;
      if (f.landingLag <= 0) setState(f, 'idle');
      break;
    case 'dodge': {
      const d = ctx.c.dodge;
      f.dodgeTicks++;
      f.vx *= d.decay;
      if (!f.grounded) f.vy *= d.decay;
      if (f.dodgeTicks >= d.duration) {
        f.dodgeCooldown = f.grounded ? d.groundCooldown : d.airCooldown;
        setState(f, f.grounded ? 'idle' : 'air');
      }
      break;
    }
    case 'attack':
      runAttack(f, input, ctx);
      break;
    default:
      break;
  }

  if (f.state === 'idle' || f.state === 'run' || f.state === 'air') {
    updateActionable(f, input, ctx);
  }

  physics(f, input, ctx);
  f.prevInput = input;
};
