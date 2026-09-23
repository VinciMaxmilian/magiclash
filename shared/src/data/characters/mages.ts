import type { AttackDefinition, CharacterDefinition } from '../../characters/types';

/**
 * MAGOS — três especializações que jogam de formas diferentes:
 *  • Fogo: dano e área. Bolas de fogo explodem, coluna de fogo controla o chão.
 *  • Gelo: controle. Quase tudo aplica LENTIDÃO; espinhos e lança perfurante.
 *  • Raio: velocidade e combos. Projéteis rápidos, hitstun maior, raio frontal instantâneo.
 * Todos flutuam mais (queda lenta) e são mais leves que os lutadores de armadura.
 */

const NO_KB = { base: 0, growth: 0, angle: 0 };

type MageBase = Omit<CharacterDefinition, 'id' | 'name' | 'description' | 'attacks' | 'moveset' | 'projectiles' | 'class'>;

const MAGE_BASE: MageBase = {
  preferredRange: 'mid',
  weight: 0.95,
  hitstunMultiplier: 1,
  moveSpeed: 2.6,
  groundAccel: 0.5,
  groundFriction: 0.5,
  airSpeed: 2.4,
  airAccel: 0.24,
  airFriction: 0.04,
  jumpForce: 7.2,
  airJumpForce: 6.4,
  maxAirJumps: 2,
  jumpCutMultiplier: 0.5,
  gravity: 0.29,
  maxFallSpeed: 4.6,
  fastFallSpeed: 7.4,
  body: { w: 14, h: 32 },
  hurtboxes: [
    { x: -7, y: -30, w: 14, h: 30 },
    { x: -5, y: -36, w: 10, h: 7 },
  ],
  dodge: { duration: 22, invulnFrom: 2, invulnTo: 14, speed: 4.6, decay: 0.9, groundCooldown: 45, airCooldown: 40 },
};

/** Staff strike every mage shares (close-range answer). */
const staffStrike = (hitstunMultiplier = 1): AttackDefinition => ({
  id: 'staff_strike', name: 'Golpe de Cajado', direction: 'neutral', aerial: false,
  damage: 5, knockback: { base: 3.0, growth: 3.2, angle: 35 },
  startup: 5, active: 3, recovery: 12, cooldown: 0, range: 'short',
  hitboxes: [{ x: 4, y: -30, w: 24, h: 14 }], movement: [{ frame: 4, vx: 1.2 }], friction: 0.8,
  hitstunMultiplier, effect: 'slash_small', sound: 'staff', anim: 'staff_jab',
});

const staffSweep: AttackDefinition = {
  id: 'staff_sweep', name: 'Varredura de Cajado', direction: 'down', aerial: false,
  damage: 5, knockback: { base: 3.0, growth: 3.2, angle: 25 },
  startup: 5, active: 4, recovery: 12, cooldown: 6, range: 'short',
  hitboxes: [{ x: 2, y: -10, w: 28, h: 10 }], friction: 0.8,
  effect: 'slash_low', sound: 'staff', anim: 'staff_low',
};

// ── FOGO ─────────────────────────────────────────────────────────────────────

export const FIRE_MAGE: CharacterDefinition = {
  ...MAGE_BASE,
  id: 'fire_mage',
  name: 'Mago de Fogo',
  class: 'mage',
  description: 'Explosões e controle de área. Muito dano, recuperação lenta dos feitiços.',
  preferredRange: 'mid',
  projectiles: [
    {
      id: 'fireball', w: 10, h: 10, speed: 4.6, angle: 0, gravity: 0, lifetime: 70,
      damage: 6, knockback: { base: 3.0, growth: 4.4, angle: 35 },
      onStage: 'explode', explodeOnHit: true, explodeOnExpire: true,
      explosion: { w: 36, h: 36, damage: 4, knockback: { base: 3.4, growth: 4.2, angle: 50 }, ticks: 6 },
      sprite: 'fireball', hitEffect: 'explosion', sound: 'fire',
    },
    {
      id: 'great_fireball', w: 16, h: 16, speed: 3.6, angle: 0, gravity: 0, lifetime: 90,
      damage: 9, knockback: { base: 4.0, growth: 6.8, angle: 38 }, hitstopBonus: 2,
      onStage: 'explode', explodeOnHit: true, explodeOnExpire: true,
      explosion: { w: 54, h: 54, damage: 6, knockback: { base: 4.2, growth: 6.0, angle: 50 }, ticks: 8 },
      sprite: 'great_fireball', hitEffect: 'explosion', sound: 'fire_heavy',
    },
    {
      id: 'fire_column', w: 22, h: 72, speed: 0, angle: 0, gravity: 0, lifetime: 36,
      damage: 4, knockback: { base: 2.8, growth: 2.6, angle: 88 }, pierce: 99, rehitInterval: 12,
      onStage: 'pass', grounded: true, sprite: 'fire_column', hitEffect: 'spark', sound: 'fire_heavy',
    },
  ],
  attacks: [
    staffStrike(),
    staffSweep,
    {
      id: 'fireball_cast', name: 'Bola de Fogo', direction: 'side', aerial: false,
      ...{ damage: 0, knockback: NO_KB },
      startup: 10, active: 1, recovery: 16, cooldown: 30, range: 'long',
      hitboxes: [], projectiles: [{ id: 'fireball', frame: 10, x: 14, y: -24 }],
      effect: 'none', sound: 'cast', anim: 'cast_forward',
    },
    {
      id: 'flame_arc', name: 'Arco de Chamas', direction: 'up', aerial: false,
      damage: 7, knockback: { base: 3.6, growth: 4.6, angle: 85 },
      startup: 7, active: 6, recovery: 14, cooldown: 8, range: 'short',
      hitboxes: [{ x: -14, y: -60, w: 32, h: 28 }], friction: 0.8,
      effect: 'fire_arc', sound: 'fire', anim: 'cast_up',
    },
    {
      id: 'flame_burst', name: 'Explosão Próxima', direction: 'down', aerial: false,
      damage: 11, knockback: { base: 4.4, growth: 6.4, angle: 55 },
      startup: 12, active: 5, recovery: 22, cooldown: 45, range: 'short',
      hitboxes: [{ x: -26, y: -36, w: 52, h: 38 }], friction: 0.7, hitstopBonus: 2,
      effect: 'fire_burst', sound: 'fire_heavy', anim: 'cast_burst',
    },
    {
      id: 'fire_column_cast', name: 'Coluna de Fogo', direction: 'side', aerial: false,
      ...{ damage: 0, knockback: NO_KB },
      startup: 16, active: 1, recovery: 22, cooldown: 70, range: 'long',
      hitboxes: [], projectiles: [{ id: 'fire_column', frame: 16, x: 64, y: -10 }],
      effect: 'none', sound: 'cast', anim: 'cast_ground',
    },
    {
      id: 'charged_fireball', name: 'Bola de Fogo Carregada', direction: 'neutral', aerial: false,
      ...{ damage: 0, knockback: NO_KB },
      startup: 14, active: 1, recovery: 20, cooldown: 60, range: 'long',
      hitboxes: [], projectiles: [{ id: 'great_fireball', frame: 14, x: 16, y: -24 }],
      charge: { frame: 10, maxTicks: 60, damage: 2.0, knockback: 1.8, speed: 1.3 },
      effect: 'none', sound: 'cast', anim: 'cast_charge',
    },
    {
      id: 'fire_jet', name: 'Jato de Fogo', direction: 'up', aerial: false,
      damage: 8, knockback: { base: 4.0, growth: 5.6, angle: 80 },
      startup: 6, active: 10, recovery: 22, cooldown: 20, range: 'short',
      hitboxes: [{ x: -9, y: -6, w: 18, h: 22 }], movement: [{ frame: 6, vx: 1.2, vy: -9 }],
      recoveryMove: true, landingLag: 10,
      effect: 'fire_trail', sound: 'fire_heavy', anim: 'leap',
    },
    {
      id: 'air_fireball', name: 'Bola de Fogo Aérea', direction: 'side', aerial: true,
      ...{ damage: 0, knockback: NO_KB },
      startup: 9, active: 1, recovery: 14, cooldown: 30, range: 'long',
      hitboxes: [], projectiles: [{ id: 'fireball', frame: 9, x: 14, y: -22 }], landingLag: 6, gravityScale: 0.5,
      effect: 'none', sound: 'cast', anim: 'air_cast',
    },
    {
      id: 'air_flame_arc', name: 'Arco de Chamas Aéreo', direction: 'up', aerial: true,
      damage: 7, knockback: { base: 3.4, growth: 4.4, angle: 86 },
      startup: 6, active: 6, recovery: 13, cooldown: 6, range: 'short',
      hitboxes: [{ x: -16, y: -62, w: 34, h: 28 }], landingLag: 6,
      effect: 'fire_arc', sound: 'fire', anim: 'air_cast_up',
    },
    {
      id: 'meteor_kick', name: 'Chute Meteoro', direction: 'down', aerial: true,
      damage: 8, knockback: { base: 3.0, growth: 4.4, angle: -60 },
      startup: 8, active: 6, recovery: 14, cooldown: 8, range: 'short',
      hitboxes: [{ x: -7, y: -6, w: 16, h: 20 }], landingLag: 10,
      effect: 'fire_trail', sound: 'fire', anim: 'air_stomp',
    },
    {
      id: 'air_charged_fireball', name: 'Bola de Fogo Carregada Aérea', direction: 'side', aerial: true,
      ...{ damage: 0, knockback: NO_KB },
      startup: 14, active: 1, recovery: 18, cooldown: 60, range: 'long',
      hitboxes: [], projectiles: [{ id: 'great_fireball', frame: 14, x: 16, y: -22 }],
      charge: { frame: 10, maxTicks: 45, damage: 1.8, knockback: 1.7, speed: 1.3 },
      landingLag: 8, gravityScale: 0.4,
      effect: 'none', sound: 'cast', anim: 'air_cast',
    },
    {
      id: 'meteor_drop', name: 'Queda Flamejante', direction: 'down', aerial: true,
      damage: 12, knockback: { base: 4.6, growth: 6.4, angle: 55 },
      startup: 12, active: 40, recovery: 20, cooldown: 30, range: 'short',
      hitboxes: [{ x: -14, y: -12, w: 28, h: 20 }],
      movement: [{ frame: 0, vx: 0, vy: -2 }, { frame: 12, vx: 0, vy: 9 }],
      gravityScale: 0.3, untilLanding: true, landingLag: 18, hitstopBonus: 2,
      effect: 'fire_trail', sound: 'fire_heavy', anim: 'plunge',
    },
  ],
  moveset: {
    neutral_light: 'staff_strike',
    side_light: 'fireball_cast',
    up_light: 'flame_arc',
    down_light: 'staff_sweep',
    neutral_heavy: 'charged_fireball',
    side_heavy: 'fire_column_cast',
    down_heavy: 'flame_burst',
    up_heavy: 'fire_jet',
    air_neutral_light: 'air_fireball',
    air_side_light: 'air_fireball',
    air_up_light: 'air_flame_arc',
    air_down_light: 'meteor_kick',
    air_neutral_heavy: 'air_charged_fireball',
    air_side_heavy: 'air_charged_fireball',
    air_up_heavy: 'fire_jet',
    air_down_heavy: 'meteor_drop',
  },
};

// ── GELO ─────────────────────────────────────────────────────────────────────

const CHILL = { kind: 'slow' as const, ticks: 90, factor: 0.65 };
const FREEZE = { kind: 'slow' as const, ticks: 140, factor: 0.5 };

export const ICE_MAGE: CharacterDefinition = {
  ...MAGE_BASE,
  id: 'ice_mage',
  name: 'Mago de Gelo',
  class: 'mage',
  description: 'Controle: seus feitiços deixam o inimigo lento. Espinhos no chão e lança perfurante.',
  preferredRange: 'mid',
  weight: 1.0,
  moveSpeed: 2.5,
  projectiles: [
    {
      id: 'ice_shard', w: 10, h: 6, speed: 7, angle: 0, gravity: 0, lifetime: 55,
      damage: 6, knockback: { base: 2.6, growth: 3.4, angle: 20 }, status: CHILL,
      onStage: 'destroy', sprite: 'ice_shard', hitEffect: 'frost', sound: 'ice',
    },
    {
      id: 'ice_lance', w: 18, h: 6, speed: 6, angle: 0, gravity: 0, lifetime: 80,
      damage: 8, knockback: { base: 4.2, growth: 7.2, angle: 28 }, pierce: 2, status: FREEZE, hitstopBonus: 2,
      onStage: 'destroy', sprite: 'ice_lance', hitEffect: 'frost', sound: 'ice_heavy',
    },
    {
      id: 'ice_spikes', w: 40, h: 26, speed: 0, angle: 0, gravity: 0, lifetime: 24,
      damage: 10, knockback: { base: 4.4, growth: 6.0, angle: 72 }, pierce: 99, status: CHILL,
      onStage: 'pass', grounded: true, sprite: 'ice_spikes', hitEffect: 'frost', sound: 'ice_heavy',
    },
  ],
  attacks: [
    staffStrike(),
    staffSweep,
    {
      id: 'ice_shard_cast', name: 'Projétil de Gelo', direction: 'side', aerial: false,
      ...{ damage: 0, knockback: NO_KB },
      startup: 8, active: 1, recovery: 14, cooldown: 22, range: 'long',
      hitboxes: [], projectiles: [{ id: 'ice_shard', frame: 8, x: 14, y: -24 }],
      effect: 'none', sound: 'cast', anim: 'cast_forward',
    },
    {
      id: 'frost_burst', name: 'Rajada Curta', direction: 'down', aerial: false,
      damage: 6, knockback: { base: 3.2, growth: 3.8, angle: 40 },
      startup: 7, active: 5, recovery: 15, cooldown: 20, range: 'short',
      hitboxes: [{ x: 4, y: -30, w: 36, h: 28 }], status: FREEZE, friction: 0.8,
      effect: 'frost_burst', sound: 'ice', anim: 'cast_burst',
    },
    {
      id: 'icicle_rise', name: 'Ataque Vertical Gélido', direction: 'up', aerial: false,
      damage: 7, knockback: { base: 3.6, growth: 4.6, angle: 86 },
      startup: 7, active: 6, recovery: 14, cooldown: 8, range: 'short',
      hitboxes: [{ x: -12, y: -62, w: 28, h: 30 }], status: CHILL, friction: 0.8,
      effect: 'frost_arc', sound: 'ice', anim: 'cast_up',
    },
    {
      id: 'ice_spikes_cast', name: 'Espinhos de Gelo', direction: 'side', aerial: false,
      ...{ damage: 0, knockback: NO_KB },
      startup: 13, active: 1, recovery: 22, cooldown: 60, range: 'medium',
      hitboxes: [], projectiles: [{ id: 'ice_spikes', frame: 13, x: 50, y: -10 }],
      effect: 'none', sound: 'cast', anim: 'cast_ground',
    },
    {
      id: 'glacial_lance', name: 'Lança Glacial', direction: 'neutral', aerial: false,
      ...{ damage: 0, knockback: NO_KB },
      startup: 14, active: 1, recovery: 20, cooldown: 55, range: 'long',
      hitboxes: [], projectiles: [{ id: 'ice_lance', frame: 14, x: 14, y: -24 }],
      charge: { frame: 10, maxTicks: 60, damage: 2.1, knockback: 1.8, speed: 1.5 },
      effect: 'none', sound: 'cast', anim: 'cast_charge',
    },
    {
      id: 'frost_nova', name: 'Nova Congelante', direction: 'down', aerial: false,
      damage: 11, knockback: { base: 4.4, growth: 6.4, angle: 60 },
      startup: 15, active: 5, recovery: 26, cooldown: 70, range: 'short',
      hitboxes: [{ x: -36, y: -42, w: 72, h: 44 }], status: FREEZE, hitstopBonus: 2, friction: 0.7,
      effect: 'frost_burst', sound: 'ice_heavy', anim: 'cast_burst',
    },
    {
      id: 'ice_pillar', name: 'Pilar de Gelo', direction: 'up', aerial: false,
      damage: 7, knockback: { base: 3.8, growth: 5.0, angle: 82 },
      startup: 6, active: 10, recovery: 22, cooldown: 20, range: 'short',
      hitboxes: [{ x: -9, y: -6, w: 18, h: 22 }], movement: [{ frame: 6, vx: 1.2, vy: -8.8 }],
      recoveryMove: true, landingLag: 10, status: CHILL,
      effect: 'frost_trail', sound: 'ice_heavy', anim: 'leap',
    },
    {
      id: 'air_ice_shard', name: 'Projétil de Gelo Aéreo', direction: 'side', aerial: true,
      ...{ damage: 0, knockback: NO_KB },
      startup: 7, active: 1, recovery: 13, cooldown: 22, range: 'long',
      hitboxes: [], projectiles: [{ id: 'ice_shard', frame: 7, x: 14, y: -22 }], landingLag: 6, gravityScale: 0.5,
      effect: 'none', sound: 'cast', anim: 'air_cast',
    },
    {
      id: 'air_icicle', name: 'Pingente Aéreo', direction: 'up', aerial: true,
      damage: 6, knockback: { base: 3.4, growth: 4.2, angle: 86 },
      startup: 6, active: 6, recovery: 13, cooldown: 6, range: 'short',
      hitboxes: [{ x: -16, y: -62, w: 34, h: 28 }], status: CHILL, landingLag: 6,
      effect: 'frost_arc', sound: 'ice', anim: 'air_cast_up',
    },
    {
      id: 'ice_stomp', name: 'Pisada Gélida', direction: 'down', aerial: true,
      damage: 7, knockback: { base: 3.0, growth: 4.2, angle: -60 },
      startup: 8, active: 6, recovery: 14, cooldown: 8, range: 'short',
      hitboxes: [{ x: -7, y: -6, w: 16, h: 20 }], status: CHILL, landingLag: 10,
      effect: 'frost_trail', sound: 'ice', anim: 'air_stomp',
    },
    {
      id: 'air_glacial_lance', name: 'Lança Glacial Aérea', direction: 'side', aerial: true,
      ...{ damage: 0, knockback: NO_KB },
      startup: 14, active: 1, recovery: 18, cooldown: 55, range: 'long',
      hitboxes: [], projectiles: [{ id: 'ice_lance', frame: 14, x: 14, y: -22 }],
      charge: { frame: 10, maxTicks: 45, damage: 1.9, knockback: 1.7, speed: 1.4 },
      landingLag: 8, gravityScale: 0.4,
      effect: 'none', sound: 'cast', anim: 'air_cast',
    },
    {
      id: 'hail_drop', name: 'Queda de Granizo', direction: 'down', aerial: true,
      damage: 11, knockback: { base: 4.4, growth: 6.2, angle: 55 },
      startup: 12, active: 40, recovery: 20, cooldown: 30, range: 'short',
      hitboxes: [{ x: -14, y: -12, w: 28, h: 20 }], status: CHILL,
      movement: [{ frame: 0, vx: 0, vy: -2 }, { frame: 12, vx: 0, vy: 9 }],
      gravityScale: 0.3, untilLanding: true, landingLag: 18, hitstopBonus: 2,
      effect: 'frost_trail', sound: 'ice_heavy', anim: 'plunge',
    },
  ],
  moveset: {
    neutral_light: 'staff_strike',
    side_light: 'ice_shard_cast',
    up_light: 'icicle_rise',
    down_light: 'frost_burst',
    neutral_heavy: 'glacial_lance',
    side_heavy: 'ice_spikes_cast',
    down_heavy: 'frost_nova',
    up_heavy: 'ice_pillar',
    air_neutral_light: 'air_ice_shard',
    air_side_light: 'air_ice_shard',
    air_up_light: 'air_icicle',
    air_down_light: 'ice_stomp',
    air_neutral_heavy: 'air_glacial_lance',
    air_side_heavy: 'air_glacial_lance',
    air_up_heavy: 'ice_pillar',
    air_down_heavy: 'hail_drop',
  },
};

// ── RAIO ─────────────────────────────────────────────────────────────────────

const SHOCK = 1.35; // hitstun multiplier: lightning keeps targets locked longer

export const LIGHTNING_MAGE: CharacterDefinition = {
  ...MAGE_BASE,
  id: 'lightning_mage',
  name: 'Mago de Raio',
  class: 'mage',
  description: 'Rápido e combativo. Projéteis velozes e hitstun maior; pouco dano por golpe.',
  preferredRange: 'mid',
  weight: 0.95,
  moveSpeed: 2.9,
  airSpeed: 2.6,
  projectiles: [
    {
      id: 'spark_bolt', w: 10, h: 6, speed: 11, angle: 0, gravity: 0, lifetime: 28,
      damage: 5, knockback: { base: 2.6, growth: 3.4, angle: 30 }, hitstunMultiplier: 1.5,
      onStage: 'destroy', sprite: 'spark_bolt', hitEffect: 'shock', sound: 'zap',
    },
    {
      id: 'thunder_beam', w: 112, h: 10, speed: 0, angle: 0, gravity: 0, lifetime: 9,
      damage: 12, knockback: { base: 4.4, growth: 7.4, angle: 25 }, pierce: 3, hitstopBonus: 2,
      hitstunMultiplier: SHOCK, onStage: 'pass', attached: true,
      sprite: 'thunder_beam', hitEffect: 'shock', sound: 'thunder',
    },
    {
      id: 'sky_spark', w: 16, h: 62, speed: 0, angle: 0, gravity: 0, lifetime: 8,
      damage: 7, knockback: { base: 3.8, growth: 5.0, angle: 88 }, pierce: 3,
      hitstunMultiplier: SHOCK, onStage: 'pass', attached: true,
      sprite: 'sky_spark', hitEffect: 'shock', sound: 'zap',
    },
    {
      id: 'ball_lightning', w: 14, h: 14, speed: 3.2, angle: 0, gravity: 0, lifetime: 100,
      damage: 4, knockback: { base: 2.4, growth: 2.6, angle: 45 }, pierce: 99, rehitInterval: 10,
      hitstunMultiplier: 1.6, onStage: 'destroy', sprite: 'ball_lightning', hitEffect: 'shock', sound: 'zap',
    },
    {
      id: 'thunderstrike', w: 18, h: 130, speed: 0, angle: 0, gravity: 0, lifetime: 10,
      damage: 12, knockback: { base: 4.6, growth: 7.0, angle: 80 }, pierce: 99, hitstopBonus: 3,
      hitstunMultiplier: SHOCK, onStage: 'pass', grounded: true,
      sprite: 'thunderstrike', hitEffect: 'shock', sound: 'thunder',
    },
  ],
  attacks: [
    staffStrike(SHOCK),
    {
      id: 'spark_cast', name: 'Descarga Elétrica', direction: 'side', aerial: false,
      ...{ damage: 0, knockback: NO_KB },
      startup: 6, active: 1, recovery: 10, cooldown: 14, range: 'long',
      hitboxes: [], projectiles: [{ id: 'spark_bolt', frame: 6, x: 14, y: -24 }],
      effect: 'none', sound: 'cast', anim: 'cast_forward',
    },
    {
      id: 'electric_arc', name: 'Arco Elétrico', direction: 'down', aerial: false,
      damage: 7, knockback: { base: 3.6, growth: 4.8, angle: 50 },
      startup: 6, active: 4, recovery: 13, cooldown: 10, range: 'short',
      hitboxes: [{ x: -6, y: -28, w: 38, h: 30 }], hitstunMultiplier: SHOCK, friction: 0.8,
      effect: 'shock_arc', sound: 'zap', anim: 'cast_burst',
    },
    {
      id: 'sky_spark_cast', name: 'Ataque Vertical Elétrico', direction: 'up', aerial: false,
      ...{ damage: 0, knockback: NO_KB },
      startup: 8, active: 1, recovery: 14, cooldown: 12, range: 'medium',
      hitboxes: [], projectiles: [{ id: 'sky_spark', frame: 8, x: 4, y: -58 }],
      effect: 'none', sound: 'cast', anim: 'cast_up',
    },
    {
      id: 'thunder_beam_cast', name: 'Raio Frontal', direction: 'neutral', aerial: false,
      ...{ damage: 0, knockback: NO_KB },
      startup: 15, active: 9, recovery: 22, cooldown: 55, range: 'long',
      hitboxes: [], projectiles: [{ id: 'thunder_beam', frame: 15, x: 66, y: -24 }], friction: 0.6,
      effect: 'none', sound: 'cast', anim: 'cast_charge',
    },
    {
      id: 'ball_lightning_cast', name: 'Esfera Elétrica Carregada', direction: 'side', aerial: false,
      ...{ damage: 0, knockback: NO_KB },
      startup: 14, active: 1, recovery: 18, cooldown: 60, range: 'long',
      hitboxes: [], projectiles: [{ id: 'ball_lightning', frame: 14, x: 16, y: -24 }],
      charge: { frame: 10, maxTicks: 50, damage: 2.0, knockback: 2.0, speed: 1.4 },
      effect: 'none', sound: 'cast', anim: 'cast_charge',
    },
    {
      id: 'thunderstrike_cast', name: 'Relâmpago', direction: 'down', aerial: false,
      ...{ damage: 0, knockback: NO_KB },
      startup: 17, active: 1, recovery: 22, cooldown: 60, range: 'medium',
      hitboxes: [], projectiles: [{ id: 'thunderstrike', frame: 17, x: 52, y: -10 }],
      effect: 'none', sound: 'cast', anim: 'cast_ground',
    },
    {
      id: 'blink', name: 'Salto Relâmpago', direction: 'up', aerial: false,
      damage: 5, knockback: { base: 3.4, growth: 4.0, angle: 78 },
      startup: 4, active: 8, recovery: 20, cooldown: 20, range: 'short',
      hitboxes: [{ x: -8, y: -36, w: 16, h: 40 }], movement: [{ frame: 4, vx: 2.6, vy: -9.6 }],
      recoveryMove: true, landingLag: 8, hitstunMultiplier: SHOCK,
      effect: 'shock_trail', sound: 'thunder', anim: 'leap',
    },
    {
      id: 'air_spark', name: 'Descarga Aérea', direction: 'side', aerial: true,
      ...{ damage: 0, knockback: NO_KB },
      startup: 5, active: 1, recovery: 11, cooldown: 14, range: 'long',
      hitboxes: [], projectiles: [{ id: 'spark_bolt', frame: 5, x: 14, y: -22 }], landingLag: 5, gravityScale: 0.5,
      effect: 'none', sound: 'cast', anim: 'air_cast',
    },
    {
      id: 'air_sky_spark', name: 'Faísca Celeste', direction: 'up', aerial: true,
      ...{ damage: 0, knockback: NO_KB },
      startup: 7, active: 1, recovery: 13, cooldown: 12, range: 'medium',
      hitboxes: [], projectiles: [{ id: 'sky_spark', frame: 7, x: 4, y: -58 }], landingLag: 6,
      effect: 'none', sound: 'cast', anim: 'air_cast_up',
    },
    {
      id: 'static_drop', name: 'Queda Estática', direction: 'down', aerial: true,
      damage: 7, knockback: { base: 3.0, growth: 4.2, angle: -60 },
      startup: 7, active: 6, recovery: 13, cooldown: 8, range: 'short',
      hitboxes: [{ x: -7, y: -6, w: 16, h: 20 }], hitstunMultiplier: SHOCK, landingLag: 9,
      effect: 'shock_trail', sound: 'zap', anim: 'air_stomp',
    },
    {
      id: 'air_ball_lightning', name: 'Esfera Elétrica Aérea', direction: 'side', aerial: true,
      ...{ damage: 0, knockback: NO_KB },
      startup: 14, active: 1, recovery: 18, cooldown: 60, range: 'long',
      hitboxes: [], projectiles: [{ id: 'ball_lightning', frame: 14, x: 16, y: -22 }],
      charge: { frame: 10, maxTicks: 40, damage: 1.8, knockback: 1.8, speed: 1.3 },
      landingLag: 8, gravityScale: 0.4,
      effect: 'none', sound: 'cast', anim: 'air_cast',
    },
    {
      id: 'bolt_dive', name: 'Mergulho Trovejante', direction: 'down', aerial: true,
      damage: 11, knockback: { base: 4.4, growth: 6.2, angle: 55 },
      startup: 10, active: 40, recovery: 18, cooldown: 30, range: 'short',
      hitboxes: [{ x: -14, y: -12, w: 28, h: 20 }], hitstunMultiplier: SHOCK,
      movement: [{ frame: 0, vx: 0, vy: -2 }, { frame: 10, vx: 0, vy: 11 }],
      gravityScale: 0.3, untilLanding: true, landingLag: 16, hitstopBonus: 2,
      effect: 'shock_trail', sound: 'thunder', anim: 'plunge',
    },
  ],
  moveset: {
    neutral_light: 'staff_strike',
    side_light: 'spark_cast',
    up_light: 'sky_spark_cast',
    down_light: 'electric_arc',
    neutral_heavy: 'thunder_beam_cast',
    side_heavy: 'ball_lightning_cast',
    down_heavy: 'thunderstrike_cast',
    up_heavy: 'blink',
    air_neutral_light: 'air_spark',
    air_side_light: 'air_spark',
    air_up_light: 'air_sky_spark',
    air_down_light: 'static_drop',
    air_neutral_heavy: 'air_ball_lightning',
    air_side_heavy: 'air_ball_lightning',
    air_up_heavy: 'blink',
    air_down_heavy: 'bolt_dive',
  },
};
