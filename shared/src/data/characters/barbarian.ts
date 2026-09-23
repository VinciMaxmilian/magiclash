import type { CharacterDefinition } from '../../characters/types';

/**
 * BÁRBARO — o mais pesado e o que bate mais forte. Golpes lentos, mobilidade baixa.
 * O machado arremessado é a ferramenta de longa distância, mas custa caro: enquanto o
 * machado está no ar ou cravado no cenário, o Bárbaro luta DESARMADO (golpes mais fracos).
 * Encostar no machado cravado o recupera; ele também volta sozinho depois de um tempo.
 */
export const BARBARIAN: CharacterDefinition = {
  id: 'barbarian',
  name: 'Bárbaro',
  class: 'barbarian',
  description: 'Força bruta e machado de guerra. Arremessa o machado, mas fica desarmado até recuperá-lo.',
  preferredRange: 'close',

  weight: 1.28,
  hitstunMultiplier: 0.9,

  moveSpeed: 2.25,
  groundAccel: 0.45,
  groundFriction: 0.5,
  airSpeed: 2.1,
  airAccel: 0.18,
  airFriction: 0.04,

  jumpForce: 7.1,
  airJumpForce: 6.2,
  maxAirJumps: 2,
  jumpCutMultiplier: 0.5,

  gravity: 0.34,
  maxFallSpeed: 5.6,
  fastFallSpeed: 8.4,

  body: { w: 18, h: 36 },
  hurtboxes: [
    { x: -9, y: -34, w: 18, h: 34 },
    { x: -7, y: -40, w: 14, h: 7 },
  ],

  dodge: { duration: 22, invulnFrom: 3, invulnTo: 14, speed: 4.2, decay: 0.9, groundCooldown: 50, airCooldown: 45 },

  projectiles: [
    {
      id: 'thrown_axe', w: 16, h: 16, speed: 6.6, angle: 12, gravity: 0.13, lifetime: 100,
      damage: 11, knockback: { base: 4.6, growth: 7.0, angle: 35 },
      onStage: 'stick', stuckLifetime: 240, weapon: true, hitstopBonus: 2,
      sprite: 'axe', hitEffect: 'spark_big', sound: 'axe_throw',
    },
  ],

  attacks: [
    // Armed
    {
      id: 'axe_chop', name: 'Golpe Frontal de Machado', direction: 'neutral', aerial: false,
      damage: 8, knockback: { base: 3.6, growth: 4.8, angle: 35 },
      startup: 7, active: 4, recovery: 16, cooldown: 0, range: 'short',
      hitboxes: [{ x: 6, y: -34, w: 30, h: 24 }], movement: [{ frame: 5, vx: 1.6 }], friction: 0.82,
      unarmed: 'fist_jab', effect: 'slash_wide', sound: 'axe_light', anim: 'swing_h',
    },
    {
      id: 'axe_sweep', name: 'Varredura de Machado', direction: 'side', aerial: false,
      damage: 9, knockback: { base: 3.8, growth: 5.2, angle: 28 },
      startup: 8, active: 5, recovery: 18, cooldown: 8, range: 'medium',
      hitboxes: [{ x: 4, y: -28, w: 40, h: 18 }], movement: [{ frame: 6, vx: 2.2 }], friction: 0.85,
      unarmed: 'shoulder_bash', effect: 'slash_wide', sound: 'axe_light', anim: 'swing_h2',
    },
    {
      id: 'vertical_chop', name: 'Ataque Vertical', direction: 'up', aerial: false,
      damage: 9, knockback: { base: 3.8, growth: 5.0, angle: 85 },
      startup: 8, active: 6, recovery: 17, cooldown: 8, range: 'short',
      hitboxes: [{ x: -10, y: -64, w: 36, h: 32 }], friction: 0.75,
      unarmed: 'uppercut', effect: 'slash_up', sound: 'axe_light', anim: 'swing_up',
    },
    {
      id: 'whirlwind', name: 'Ataque Giratório', direction: 'down', aerial: false,
      damage: 10, knockback: { base: 4.2, growth: 6.0, angle: 40 },
      startup: 10, active: 12, recovery: 20, cooldown: 40, range: 'medium',
      hitboxes: [{ x: -32, y: -32, w: 64, h: 28 }], friction: 0.9, hitstopBonus: 1,
      unarmed: 'stomp', effect: 'spin', sound: 'axe_heavy', anim: 'spin',
    },
    {
      id: 'heavy_cleave', name: 'Golpe Pesado', direction: 'neutral', aerial: false,
      damage: 19, knockback: { base: 6.0, growth: 9.6, angle: 40 },
      startup: 22, active: 5, recovery: 30, cooldown: 50, range: 'medium',
      hitboxes: [{ x: 2, y: -54, w: 42, h: 54 }], friction: 0.7, hitstopBonus: 4,
      unarmed: 'heavy_punch', effect: 'slash_heavy', sound: 'axe_heavy', anim: 'overhead',
    },
    {
      id: 'axe_throw', name: 'Arremesso de Machado', direction: 'side', aerial: false,
      damage: 0, knockback: { base: 0, growth: 0, angle: 0 },
      startup: 14, active: 1, recovery: 20, cooldown: 90, range: 'long',
      hitboxes: [], projectiles: [{ id: 'thrown_axe', frame: 14, x: 10, y: -32 }], gravityScale: 0.5,
      unarmed: 'heavy_punch', effect: 'none', sound: 'axe_heavy', anim: 'throw',
    },
    {
      id: 'leap_chop', name: 'Salto Brutal', direction: 'up', aerial: false,
      damage: 11, knockback: { base: 4.6, growth: 6.6, angle: 75 },
      startup: 8, active: 10, recovery: 22, cooldown: 20, range: 'short',
      hitboxes: [{ x: -4, y: -54, w: 32, h: 54 }], movement: [{ frame: 8, vx: 1.8, vy: -8.1 }],
      recoveryMove: true, landingLag: 12, hitstopBonus: 1,
      effect: 'slash_up', sound: 'axe_heavy', anim: 'leap',
    },
    {
      id: 'air_axe', name: 'Machadada Aérea', direction: 'side', aerial: true,
      damage: 9, knockback: { base: 3.6, growth: 5.2, angle: 40 },
      startup: 7, active: 5, recovery: 15, cooldown: 4, range: 'short',
      hitboxes: [{ x: -4, y: -46, w: 40, h: 40 }], landingLag: 8,
      unarmed: 'air_kick', effect: 'slash_arc', sound: 'axe_light', anim: 'air_swing',
    },
    {
      id: 'air_up_axe', name: 'Machado ao Céu', direction: 'up', aerial: true,
      damage: 8, knockback: { base: 3.4, growth: 4.8, angle: 88 },
      startup: 7, active: 6, recovery: 15, cooldown: 4, range: 'short',
      hitboxes: [{ x: -18, y: -66, w: 38, h: 28 }], landingLag: 8,
      unarmed: 'air_kick', effect: 'slash_up', sound: 'axe_light', anim: 'air_up',
    },
    {
      id: 'air_down_axe', name: 'Machado Descendente', direction: 'down', aerial: true,
      damage: 11, knockback: { base: 3.4, growth: 5.0, angle: -70 },
      startup: 10, active: 6, recovery: 16, cooldown: 8, range: 'short',
      hitboxes: [{ x: -10, y: -8, w: 26, h: 24 }], landingLag: 12, hitstopBonus: 2,
      unarmed: 'air_stomp', effect: 'thrust_down', sound: 'axe_heavy', anim: 'air_down',
    },
    {
      id: 'ground_pound', name: 'Queda Sísmica', direction: 'down', aerial: true,
      damage: 15, knockback: { base: 5.0, growth: 7.0, angle: 60 },
      startup: 14, active: 40, recovery: 20, cooldown: 30, range: 'short',
      hitboxes: [{ x: -18, y: -12, w: 36, h: 20 }],
      movement: [{ frame: 0, vx: 0, vy: -2 }, { frame: 14, vx: 0, vy: 10 }],
      gravityScale: 0.3, untilLanding: true, landingLag: 22, hitstopBonus: 3,
      effect: 'plunge', sound: 'axe_heavy', anim: 'plunge',
    },
    // Unarmed (machado fora)
    {
      id: 'fist_jab', name: 'Soco', direction: 'neutral', aerial: false,
      damage: 4, knockback: { base: 2.6, growth: 2.4, angle: 35 },
      startup: 4, active: 3, recovery: 10, cooldown: 0, range: 'short',
      hitboxes: [{ x: 6, y: -30, w: 18, h: 12 }], friction: 0.8,
      effect: 'none', sound: 'punch', anim: 'punch',
    },
    {
      id: 'shoulder_bash', name: 'Ombrada', direction: 'side', aerial: false,
      damage: 6, knockback: { base: 3.5, growth: 4.0, angle: 30 },
      startup: 6, active: 6, recovery: 14, cooldown: 12, range: 'medium',
      hitboxes: [{ x: 4, y: -32, w: 20, h: 26 }], movement: [{ frame: 5, vx: 4.5 }], friction: 0.9,
      effect: 'none', sound: 'punch', anim: 'bash',
    },
    {
      id: 'uppercut', name: 'Gancho', direction: 'up', aerial: false,
      damage: 6, knockback: { base: 3.4, growth: 4.0, angle: 82 },
      startup: 5, active: 4, recovery: 14, cooldown: 6, range: 'short',
      hitboxes: [{ x: 0, y: -54, w: 20, h: 28 }], friction: 0.8,
      effect: 'none', sound: 'punch', anim: 'uppercut',
    },
    {
      id: 'stomp', name: 'Pisão', direction: 'down', aerial: false,
      damage: 6, knockback: { base: 3.0, growth: 4.0, angle: 70 },
      startup: 7, active: 4, recovery: 14, cooldown: 10, range: 'short',
      hitboxes: [{ x: -16, y: -8, w: 32, h: 10 }], friction: 0.8,
      effect: 'none', sound: 'punch', anim: 'stomp',
    },
    {
      id: 'heavy_punch', name: 'Punho de Ferro', direction: 'neutral', aerial: false,
      damage: 12, knockback: { base: 5.0, growth: 8.0, angle: 38 },
      startup: 16, active: 4, recovery: 24, cooldown: 40, range: 'short',
      hitboxes: [{ x: 6, y: -34, w: 24, h: 20 }], movement: [{ frame: 14, vx: 3 }], friction: 0.85, hitstopBonus: 2,
      effect: 'none', sound: 'punch', anim: 'punch_heavy',
    },
    {
      id: 'air_kick', name: 'Chute Aéreo', direction: 'side', aerial: true,
      damage: 6, knockback: { base: 3.0, growth: 4.0, angle: 40 },
      startup: 5, active: 5, recovery: 12, cooldown: 4, range: 'short',
      hitboxes: [{ x: 2, y: -26, w: 22, h: 16 }], landingLag: 6,
      effect: 'none', sound: 'punch', anim: 'air_kick',
    },
    {
      id: 'air_stomp', name: 'Pisão Aéreo', direction: 'down', aerial: true,
      damage: 7, knockback: { base: 3.0, growth: 4.0, angle: -65 },
      startup: 8, active: 5, recovery: 14, cooldown: 6, range: 'short',
      hitboxes: [{ x: -8, y: -6, w: 18, h: 16 }], landingLag: 10,
      effect: 'none', sound: 'punch', anim: 'air_stomp',
    },
  ],

  moveset: {
    neutral_light: 'axe_chop',
    side_light: 'axe_sweep',
    up_light: 'vertical_chop',
    down_light: 'whirlwind',
    neutral_heavy: 'heavy_cleave',
    down_heavy: 'heavy_cleave',
    side_heavy: 'axe_throw',
    up_heavy: 'leap_chop',
    air_neutral_light: 'air_axe',
    air_side_light: 'air_axe',
    air_up_light: 'air_up_axe',
    air_down_light: 'air_down_axe',
    air_neutral_heavy: 'axe_throw',
    air_side_heavy: 'axe_throw',
    air_up_heavy: 'leap_chop',
    air_down_heavy: 'ground_pound',
  },
};
