import type { CharacterDefinition } from '../../characters/types';

/**
 * ARQUEIRO — o mais rápido e o mais leve. Controla o espaço de média/longa distância com
 * flechas; o disparo carregado atravessa dois alvos. De perto só tem chutes rápidos:
 * depende de posicionamento e morre cedo se for pego.
 * Variações de cor (verde/azul/amarelo/vermelho) = cor do time (palette swap do capuz).
 */
export const ARCHER: CharacterDefinition = {
  id: 'archer',
  name: 'Arqueiro',
  class: 'archer',
  description: 'Arco longo e muita mobilidade. Mantém distância; frágil de perto.',
  preferredRange: 'far',

  weight: 0.84,
  hitstunMultiplier: 1.05,

  moveSpeed: 3.1,
  groundAccel: 0.65,
  groundFriction: 0.55,
  airSpeed: 2.8,
  airAccel: 0.3,
  airFriction: 0.04,

  jumpForce: 7.6,
  airJumpForce: 6.8,
  maxAirJumps: 2,
  jumpCutMultiplier: 0.5,

  gravity: 0.3,
  maxFallSpeed: 5.0,
  fastFallSpeed: 7.8,

  body: { w: 14, h: 30 },
  hurtboxes: [
    { x: -7, y: -28, w: 14, h: 28 },
    { x: -5, y: -33, w: 10, h: 6 },
  ],

  dodge: { duration: 20, invulnFrom: 2, invulnTo: 13, speed: 5.2, decay: 0.9, groundCooldown: 40, airCooldown: 36 },

  projectiles: [
    {
      id: 'arrow', w: 10, h: 4, speed: 8.5, angle: 0, gravity: 0.05, lifetime: 70,
      damage: 5, knockback: { base: 2.6, growth: 3.4, angle: 25 },
      onStage: 'stick', stuckLifetime: 40, sprite: 'arrow', hitEffect: 'spark', sound: 'arrow',
    },
    {
      id: 'arrow_up', w: 4, h: 10, speed: 8, angle: 78, gravity: 0.12, lifetime: 60,
      damage: 5, knockback: { base: 2.8, growth: 3.6, angle: 80 },
      onStage: 'stick', stuckLifetime: 40, sprite: 'arrow', hitEffect: 'spark', sound: 'arrow',
    },
    {
      id: 'heavy_arrow', w: 14, h: 5, speed: 7, angle: 0, gravity: 0.04, lifetime: 90,
      damage: 8, knockback: { base: 3.8, growth: 6.0, angle: 30 }, pierce: 2, hitstopBonus: 1,
      onStage: 'stick', stuckLifetime: 60, sprite: 'arrow_heavy', hitEffect: 'spark_big', sound: 'arrow_heavy',
    },
    {
      id: 'fan_arrow', w: 8, h: 4, speed: 7.5, angle: 20, gravity: 0.08, lifetime: 45,
      damage: 4, knockback: { base: 2.8, growth: 3.4, angle: 30 },
      onStage: 'destroy', sprite: 'arrow', hitEffect: 'spark', sound: 'arrow',
    },
  ],

  attacks: [
    {
      id: 'quick_shot', name: 'Disparo Frontal', direction: 'neutral', aerial: false,
      damage: 0, knockback: { base: 0, growth: 0, angle: 0 },
      startup: 6, active: 1, recovery: 12, cooldown: 10, range: 'long',
      hitboxes: [], projectiles: [{ id: 'arrow', frame: 6, x: 12, y: -21 }],
      effect: 'none', sound: 'bow', anim: 'bow_forward',
    },
    {
      id: 'close_kick', name: 'Chute Rápido', direction: 'side', aerial: false,
      damage: 5, knockback: { base: 3.2, growth: 3.8, angle: 35 },
      startup: 4, active: 3, recovery: 10, cooldown: 4, range: 'short',
      hitboxes: [{ x: 4, y: -24, w: 22, h: 14 }], movement: [{ frame: 3, vx: 2 }], friction: 0.85,
      effect: 'none', sound: 'punch', anim: 'kick',
    },
    {
      id: 'up_shot', name: 'Disparo para Cima', direction: 'up', aerial: false,
      damage: 0, knockback: { base: 0, growth: 0, angle: 0 },
      startup: 7, active: 1, recovery: 13, cooldown: 12, range: 'long',
      hitboxes: [], projectiles: [{ id: 'arrow_up', frame: 7, x: 4, y: -34 }],
      effect: 'none', sound: 'bow', anim: 'bow_up',
    },
    {
      id: 'sweep_kick', name: 'Rasteira', direction: 'down', aerial: false,
      damage: 5, knockback: { base: 3.0, growth: 3.2, angle: 25 },
      startup: 5, active: 4, recovery: 12, cooldown: 6, range: 'short',
      hitboxes: [{ x: 2, y: -10, w: 26, h: 10 }], friction: 0.8,
      effect: 'none', sound: 'punch', anim: 'sweep_kick',
    },
    {
      id: 'charged_shot', name: 'Disparo Carregado', direction: 'neutral', aerial: false,
      damage: 0, knockback: { base: 0, growth: 0, angle: 0 },
      startup: 16, active: 1, recovery: 18, cooldown: 40, range: 'long',
      hitboxes: [], projectiles: [{ id: 'heavy_arrow', frame: 16, x: 12, y: -21 }],
      charge: { frame: 12, maxTicks: 50, damage: 2.0, knockback: 1.8, speed: 1.6 },
      effect: 'none', sound: 'bow_heavy', anim: 'bow_charge',
    },
    {
      id: 'fan_shot', name: 'Leque de Flechas', direction: 'down', aerial: false,
      damage: 0, knockback: { base: 0, growth: 0, angle: 0 },
      startup: 14, active: 1, recovery: 20, cooldown: 70, range: 'medium',
      hitboxes: [],
      projectiles: [
        { id: 'fan_arrow', frame: 14, x: 12, y: -20, angle: 4 },
        { id: 'fan_arrow', frame: 14, x: 12, y: -22, angle: 20 },
        { id: 'fan_arrow', frame: 14, x: 12, y: -24, angle: 36 },
      ],
      effect: 'none', sound: 'bow_heavy', anim: 'bow_forward',
    },
    {
      id: 'flip_kick', name: 'Salto Mortal', direction: 'up', aerial: false,
      damage: 6, knockback: { base: 3.6, growth: 4.6, angle: 75 },
      startup: 5, active: 8, recovery: 18, cooldown: 20, range: 'short',
      hitboxes: [{ x: -8, y: -42, w: 22, h: 42 }], movement: [{ frame: 5, vx: 2.6, vy: -8.8 }],
      recoveryMove: true, landingLag: 8,
      effect: 'slash_up', sound: 'punch', anim: 'leap',
    },
    {
      id: 'air_shot', name: 'Disparo Aéreo', direction: 'side', aerial: true,
      damage: 0, knockback: { base: 0, growth: 0, angle: 0 },
      startup: 5, active: 1, recovery: 12, cooldown: 10, range: 'long',
      hitboxes: [], projectiles: [{ id: 'arrow', frame: 5, x: 12, y: -20 }], landingLag: 5, gravityScale: 0.6,
      effect: 'none', sound: 'bow', anim: 'bow_forward',
    },
    {
      id: 'air_up_shot', name: 'Disparo Aéreo para Cima', direction: 'up', aerial: true,
      damage: 0, knockback: { base: 0, growth: 0, angle: 0 },
      startup: 6, active: 1, recovery: 12, cooldown: 12, range: 'long',
      hitboxes: [], projectiles: [{ id: 'arrow_up', frame: 6, x: 4, y: -34 }], landingLag: 5,
      effect: 'none', sound: 'bow', anim: 'bow_up',
    },
    {
      id: 'dive_shot', name: 'Disparo Mergulhado', direction: 'down', aerial: true,
      damage: 0, knockback: { base: 0, growth: 0, angle: 0 },
      startup: 6, active: 1, recovery: 12, cooldown: 12, range: 'long',
      hitboxes: [], projectiles: [{ id: 'arrow', frame: 6, x: 10, y: -12, angle: -50 }], landingLag: 5,
      movement: [{ frame: 6, vx: -1.5, vy: -2.5, mode: 'add' }],
      effect: 'none', sound: 'bow', anim: 'bow_down',
    },
    {
      id: 'air_charged_shot', name: 'Disparo Carregado Aéreo', direction: 'side', aerial: true,
      damage: 0, knockback: { base: 0, growth: 0, angle: 0 },
      startup: 16, active: 1, recovery: 16, cooldown: 40, range: 'long',
      hitboxes: [], projectiles: [{ id: 'heavy_arrow', frame: 16, x: 12, y: -21 }],
      charge: { frame: 12, maxTicks: 40, damage: 2.0, knockback: 1.8, speed: 1.5 },
      landingLag: 8, gravityScale: 0.4,
      effect: 'none', sound: 'bow_heavy', anim: 'bow_charge',
    },
    {
      id: 'stomp_kick', name: 'Pisada Aérea', direction: 'down', aerial: true,
      damage: 7, knockback: { base: 3.0, growth: 4.4, angle: -60 },
      startup: 8, active: 6, recovery: 14, cooldown: 8, range: 'short',
      hitboxes: [{ x: -6, y: -6, w: 14, h: 18 }], landingLag: 10,
      effect: 'none', sound: 'punch', anim: 'air_stomp',
    },
  ],

  moveset: {
    neutral_light: 'quick_shot',
    side_light: 'close_kick',
    up_light: 'up_shot',
    down_light: 'sweep_kick',
    neutral_heavy: 'charged_shot',
    side_heavy: 'charged_shot',
    down_heavy: 'fan_shot',
    up_heavy: 'flip_kick',
    air_neutral_light: 'air_shot',
    air_side_light: 'air_shot',
    air_up_light: 'air_up_shot',
    air_down_light: 'dive_shot',
    air_neutral_heavy: 'air_charged_shot',
    air_side_heavy: 'air_charged_shot',
    air_up_heavy: 'flip_kick',
    air_down_heavy: 'stomp_kick',
  },
};
