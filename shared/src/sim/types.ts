import type { InputFrame } from '../core/input';
import type { RngState } from '../core/rng';

export type FighterStateName =
  | 'idle'
  | 'run'
  | 'air'
  | 'attack'
  | 'hitstun'
  | 'dodge'
  | 'landing'
  | 'dead';

export interface AttackInstance {
  id: string;
  /** Ticks since the attack started (0 = first tick). */
  frame: number;
  /** Fighter indices already hit by this instance (one hit per target per attack). */
  hit: number[];
  /** Ticks spent charging (0 when the attack can't charge). */
  charge: number;
  /** Button bit that started the attack (used to keep charging while held). */
  button: number;
}

export interface ProjectileState {
  uid: number;
  defId: string;
  owner: number;
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  age: number;
  /** -1 while flying; ticks since it stuck into geometry otherwise. */
  stuck: number;
  /** Remaining ticks of explosion (0 = not exploding). */
  exploding: number;
  hitsLeft: number;
  /** Last tick each fighter was hit by this projectile. */
  hitTicks: Record<number, number>;
  /** 0..1 charge ratio at spawn, and the damage/knockback multipliers it produced. */
  charge: number;
  dmgMul: number;
  kbMul: number;
  /** Offset from the owner for attached projectiles. */
  ox: number;
  oy: number;
  dead: boolean;
}

export interface FighterStats {
  kos: number;
  falls: number;
  selfDestructs: number;
  damageDealt: number;
  damageTaken: number;
  hitsLanded: number;
}

/**
 * Complete, plain-data state of one fighter. No class instances, no references: the whole
 * simulation state can be cloned / hashed / sent as a snapshot.
 */
export interface FighterState {
  index: number;
  characterId: string;
  team: number;
  name: string;

  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;

  grounded: boolean;
  onPlatform: boolean;
  wallContact: -1 | 0 | 1;

  state: FighterStateName;
  stateTicks: number;
  attack: AttackInstance | null;

  damage: number;
  stocks: number;

  airJumps: number;
  wallJumps: number;
  recoveryUsed: boolean;
  airDodgeUsed: boolean;
  fastFalling: boolean;
  jumpCutAvailable: boolean;
  coyote: number;
  downHeldTicks: number;
  dropThroughTicks: number;

  hitstun: number;
  hitlag: number;
  pendingLaunch: { vx: number; vy: number } | null;
  landingLag: number;
  dodgeTicks: number;
  dodgeCooldown: number;
  invuln: number;
  cooldowns: Record<string, number>;

  prevInput: InputFrame;
  buffer: { light: number; heavy: number; jump: number; dodge: number };

  lastHitBy: number;
  lastHitTick: number;
  respawnTimer: number;

  /** Weapon thrown and not recovered yet (barbarian). */
  weaponOut: boolean;
  slowTicks: number;
  slowFactor: number;

  stats: FighterStats;
}

export type MatchStatus = 'countdown' | 'running' | 'ended';

export interface MatchState {
  status: MatchStatus;
  countdown: number;
  /** Remaining ticks, or -1 for no time limit. */
  timeLeft: number;
  /** Winning team, -1 = draw, null = not decided. */
  winnerTeam: number | null;
  endTick: number;
}

export interface SimState {
  tick: number;
  stageId: string;
  fighters: FighterState[];
  projectiles: ProjectileState[];
  nextProjectileId: number;
  match: MatchState;
  rng: RngState;
}

export interface FighterSetup {
  characterId: string;
  team: number;
  name: string;
}

export interface MatchConfig {
  stageId: string;
  fighters: FighterSetup[];
  stocks: number;
  /** Seconds. 0 = unlimited. */
  timeLimit: number;
  seed: number;
  /** Ticks of "3, 2, 1, GO". 0 to start immediately (tests). */
  countdownTicks?: number;
}

export type SimEvent =
  | { type: 'attack_start'; fighter: number; attackId: string }
  | {
      type: 'hit';
      attacker: number;
      target: number;
      attackId: string;
      damage: number;
      launch: number;
      angle: number;
      x: number;
      y: number;
      hitstop: number;
    }
  | { type: 'jump'; fighter: number; kind: 'ground' | 'air' | 'wall' }
  | { type: 'land'; fighter: number; speed: number }
  | { type: 'bounce'; fighter: number; x: number; y: number }
  | { type: 'dodge'; fighter: number }
  | { type: 'projectile_spawn'; uid: number; owner: number; defId: string; x: number; y: number }
  | { type: 'projectile_end'; uid: number; defId: string; reason: 'hit' | 'stage' | 'expire'; x: number; y: number }
  | { type: 'explosion'; uid: number; defId: string; x: number; y: number }
  | { type: 'weapon_back'; fighter: number; picked: boolean }
  | { type: 'charge_full'; fighter: number }
  | { type: 'ko'; fighter: number; by: number; x: number; y: number }
  | { type: 'respawn'; fighter: number }
  | { type: 'countdown'; value: number }
  | { type: 'match_start' }
  | { type: 'match_end'; winnerTeam: number };
