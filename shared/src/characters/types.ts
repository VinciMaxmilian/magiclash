import type { Rect } from '../core/math';

/**
 * Data-driven character + attack definitions. Balancing = editing data files in
 * `src/data/characters/*`, never the simulation code.
 *
 * Units: pixels (1 px = 1 art pixel), ticks (60/s). Velocities in px/tick.
 * Rects are relative to the fighter's feet anchor while FACING RIGHT (y negative = up).
 */

export type CharacterClass = 'knight' | 'barbarian' | 'archer' | 'mage';

export type AttackSlot =
  | 'neutral_light'
  | 'side_light'
  | 'up_light'
  | 'down_light'
  | 'neutral_heavy'
  | 'side_heavy'
  | 'up_heavy'
  | 'down_heavy'
  | 'air_neutral_light'
  | 'air_side_light'
  | 'air_up_light'
  | 'air_down_light'
  | 'air_neutral_heavy'
  | 'air_side_heavy'
  | 'air_up_heavy'
  | 'air_down_heavy';

export const ATTACK_SLOTS: readonly AttackSlot[] = [
  'neutral_light', 'side_light', 'up_light', 'down_light',
  'neutral_heavy', 'side_heavy', 'up_heavy', 'down_heavy',
  'air_neutral_light', 'air_side_light', 'air_up_light', 'air_down_light',
  'air_neutral_heavy', 'air_side_heavy', 'air_up_heavy', 'air_down_heavy',
];

export type AttackDirection = 'neutral' | 'side' | 'up' | 'down';
export type AttackRange = 'short' | 'medium' | 'long';

export interface HitboxDefinition extends Rect {
  /** First active frame (0-based, relative to the active window) this box exists. Default 0. */
  from?: number;
  /** Last active frame (inclusive). Default: end of active window. */
  to?: number;
}

export interface KnockbackDefinition {
  /** Launch speed at 0% damage (px/tick) before weight scaling. */
  base: number;
  /** Extra launch speed per 100% of accumulated damage. */
  growth: number;
  /** Degrees. 0 = straight forward, 90 = straight up, negative = downward (spike). */
  angle: number;
}

export interface AttackMovement {
  /** Attack frame (0-based from attack start) when this impulse is applied. */
  frame: number;
  /** Forward velocity (multiplied by facing). */
  vx?: number;
  /** Vertical velocity (negative = up). */
  vy?: number;
  /** 'set' overrides velocity, 'add' adds to it. Default 'set'. */
  mode?: 'set' | 'add';
}

export interface StatusEffect {
  kind: 'slow';
  ticks: number;
  /** Movement speed multiplier while active (0.6 = 40% slower). */
  factor: number;
}

export interface ExplosionDefinition {
  w: number;
  h: number;
  damage: number;
  knockback: KnockbackDefinition;
  /** Ticks the blast stays active. */
  ticks: number;
}

/**
 * Projectiles are simulation entities with their own hitbox, trajectory and lifetime.
 * Angles use the knockback convention: 0 = forward, 90 = up.
 */
export interface ProjectileDefinition {
  id: string;
  /** Hitbox size, centered on the projectile position. */
  w: number;
  h: number;
  speed: number;
  angle: number;
  gravity: number;
  /** Per-tick velocity multiplier. Default 1. */
  drag?: number;
  lifetime: number;
  damage: number;
  knockback: KnockbackDefinition;
  /** Distinct targets it can hit before ending. Default 1. */
  pierce?: number;
  /** Lingering hazards re-hit the same target every N ticks (0/undefined = once). */
  rehitInterval?: number;
  /** What happens on touching solid geometry. */
  onStage: 'destroy' | 'stick' | 'explode' | 'pass';
  stuckLifetime?: number;
  explosion?: ExplosionDefinition;
  explodeOnHit?: boolean;
  explodeOnExpire?: boolean;
  status?: StatusEffect;
  hitstopBonus?: number;
  hitstunMultiplier?: number;
  /** The owner's weapon: while alive the owner is disarmed (barbarian axe). */
  weapon?: boolean;
  /** Moves with the owner (beams). */
  attached?: boolean;
  /** Snaps to the floor below the spawn point (columns, spikes). */
  grounded?: boolean;
  /** Renderer key and hit effect (cosmetic). */
  sprite: string;
  hitEffect: string;
  sound?: string;
}

export interface ProjectileSpawn {
  id: string;
  /** Attack frame (0-based) when it spawns. */
  frame: number;
  /** Spawn offset from the feet anchor, facing right. */
  x: number;
  y: number;
}

export interface ChargeDefinition {
  /** Attack frame that is held while the attack button stays down. */
  frame: number;
  maxTicks: number;
  /** Multipliers at full charge (linear from 1). */
  damage: number;
  knockback: number;
  speed?: number;
}

export interface AttackDefinition {
  id: string;
  name: string;
  direction: AttackDirection;
  aerial: boolean;
  damage: number;
  knockback: KnockbackDefinition;
  /** Ticks before hitboxes appear. */
  startup: number;
  /** Ticks hitboxes are live. */
  active: number;
  /** Ticks after the active window before the fighter can act again. */
  recovery: number;
  /** Ticks after the attack ends before this same attack can be used again. */
  cooldown: number;
  range: AttackRange;
  hitboxes: HitboxDefinition[];
  movement?: AttackMovement[];
  /** Gravity multiplier while the attack runs (0 = hang in the air). Default 1. */
  gravityScale?: number;
  /** Horizontal speed multiplier applied each tick while attacking (1 = keep momentum). */
  friction?: number;
  /** Aerial: cancel on landing and apply this many ticks of landing lag. */
  landingLag?: number;
  /** Attack keeps its active window until landing (plunges). */
  untilLanding?: boolean;
  /** Once per airtime (recovery moves). */
  recoveryMove?: boolean;
  /** Chain into another attack when the same button is pressed inside [from, to] (attack frames). */
  chain?: { next: string; from: number; to: number };
  /** Extra hitstop ticks on hit (heavy impacts). */
  hitstopBonus?: number;
  /** Multiplier on the hitstun this attack causes (lightning keeps targets stunned longer). */
  hitstunMultiplier?: number;
  status?: StatusEffect;
  projectiles?: ProjectileSpawn[];
  /** Hold the button to charge (archer / mages). */
  charge?: ChargeDefinition;
  /** Attack used instead while the fighter's weapon is out (thrown). */
  unarmed?: string;
  /** Visual effect id (renderer) and sound id (audio). Purely cosmetic. */
  effect: string;
  sound: string;
  /** Animation id used by the renderer. */
  anim: string;
}

export interface DodgeDefinition {
  duration: number;
  invulnFrom: number;
  invulnTo: number;
  /** Initial speed of a directional dodge (px/tick). */
  speed: number;
  /** Per-tick speed multiplier during the dodge. */
  decay: number;
  /** Cooldown after a grounded dodge ends. */
  groundCooldown: number;
  /** Cooldown after an air dodge ends (air dodge is also once per airtime). */
  airCooldown: number;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  class: CharacterClass;
  description: string;

  /** Launch resistance. 1.0 = baseline. Knockback is divided by this. */
  weight: number;
  /** Multiplier on hitstun received (heavier armor = slightly less stun). */
  hitstunMultiplier: number;

  moveSpeed: number;
  groundAccel: number;
  groundFriction: number;
  airSpeed: number;
  /** Air acceleration — "air control". */
  airAccel: number;
  airFriction: number;

  jumpForce: number;
  airJumpForce: number;
  maxAirJumps: number;
  /** Velocity multiplier applied once when jump is released while rising (short hop). */
  jumpCutMultiplier: number;

  gravity: number;
  maxFallSpeed: number;
  fastFallSpeed: number;

  /** Environment collision box: width/height, anchored bottom-center. */
  body: { w: number; h: number };
  /** Hurtboxes relative to the feet anchor (facing right). */
  hurtboxes: Rect[];

  dodge: DodgeDefinition;

  attacks: AttackDefinition[];
  /** Which attack id each directional input slot triggers. Missing slots fall back (see resolveSlot). */
  moveset: Partial<Record<AttackSlot, string>>;
  projectiles?: ProjectileDefinition[];
  /** AI hint: preferred fighting distance. */
  preferredRange: 'close' | 'mid' | 'far';
}

export const attackTotalFrames = (a: AttackDefinition): number => a.startup + a.active + a.recovery;
