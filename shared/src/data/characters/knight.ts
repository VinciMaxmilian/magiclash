import type { CharacterDefinition } from '../../characters/types';

/**
 * CAVALEIRO — resistente, velocidade média, alcance médio, bom controle terrestre.
 * Pune de perto com o combo de espada, controla o chão com cortes rápidos e fecha
 * distância com o avanço. Recuperação vertical confiável, horizontal limitada.
 *
 * Balancing lives here. Units: px, ticks (60/s), px/tick.
 */
export const KNIGHT: CharacterDefinition = {
  id: 'knight',
  name: 'Cavaleiro',
  class: 'knight',
  description: 'Armadura pesada e espada longa. Domina o chão a curta e média distância.',

  weight: 1.12,
  hitstunMultiplier: 0.95,

  moveSpeed: 2.7,
  groundAccel: 0.55,
  groundFriction: 0.5,
  airSpeed: 2.4,
  airAccel: 0.22,
  airFriction: 0.04,

  jumpForce: 7.3,
  airJumpForce: 6.5,
  maxAirJumps: 2,
  jumpCutMultiplier: 0.5,

  gravity: 0.32,
  maxFallSpeed: 5.2,
  fastFallSpeed: 8,

  body: { w: 16, h: 32 },
  hurtboxes: [
    { x: -8, y: -30, w: 16, h: 30 },
    { x: -6, y: -35, w: 12, h: 6 },
  ],

  dodge: {
    duration: 22,
    invulnFrom: 2,
    invulnTo: 15,
    speed: 4.6,
    decay: 0.9,
    groundCooldown: 45,
    airCooldown: 40,
  },

  attacks: [
    // ── Combo de espada (neutral light, 3 hits) ────────────────────────────────
    {
      id: 'sword_combo_1', name: 'Combo de Espada I', direction: 'neutral', aerial: false,
      damage: 3, knockback: { base: 2.2, growth: 0.3, angle: 40 },
      startup: 4, active: 3, recovery: 11, cooldown: 0, range: 'short',
      hitboxes: [{ x: 6, y: -26, w: 22, h: 14 }],
      movement: [{ frame: 3, vx: 1.2 }], friction: 0.8,
      chain: { next: 'sword_combo_2', from: 5, to: 16 },
      effect: 'slash_small', sound: 'sword_light', anim: 'jab1',
    },
    {
      id: 'sword_combo_2', name: 'Combo de Espada II', direction: 'neutral', aerial: false,
      damage: 4, knockback: { base: 2.6, growth: 0.3, angle: 45 },
      startup: 4, active: 3, recovery: 13, cooldown: 0, range: 'short',
      hitboxes: [{ x: 4, y: -30, w: 24, h: 18 }],
      movement: [{ frame: 3, vx: 1.4 }], friction: 0.8,
      chain: { next: 'sword_combo_3', from: 5, to: 18 },
      effect: 'slash_small', sound: 'sword_light', anim: 'jab2',
    },
    {
      id: 'sword_combo_3', name: 'Combo de Espada III', direction: 'neutral', aerial: false,
      damage: 7, knockback: { base: 4.4, growth: 5.2, angle: 38 },
      startup: 7, active: 4, recovery: 20, cooldown: 14, range: 'short',
      hitboxes: [{ x: 2, y: -34, w: 32, h: 26 }],
      movement: [{ frame: 5, vx: 2.6 }], friction: 0.85, hitstopBonus: 1,
      effect: 'slash_wide', sound: 'sword_heavy', anim: 'jab3',
    },

    // ── Corte frontal (side light) ─────────────────────────────────────────────
    {
      id: 'front_slash', name: 'Corte Frontal', direction: 'side', aerial: false,
      damage: 7, knockback: { base: 3.4, growth: 4.4, angle: 30 },
      startup: 6, active: 4, recovery: 15, cooldown: 8, range: 'medium',
      hitboxes: [{ x: 8, y: -28, w: 32, h: 16 }],
      movement: [{ frame: 4, vx: 2.2 }], friction: 0.85,
      effect: 'slash_wide', sound: 'sword_light', anim: 'side_light',
    },

    // ── Ataque para cima (up light) ────────────────────────────────────────────
    {
      id: 'rising_cut', name: 'Corte Ascendente', direction: 'up', aerial: false,
      damage: 7, knockback: { base: 3.6, growth: 4.2, angle: 84 },
      startup: 6, active: 6, recovery: 15, cooldown: 8, range: 'short',
      hitboxes: [
        { x: 6, y: -42, w: 20, h: 20, to: 2 },
        { x: -14, y: -58, w: 34, h: 22, from: 2 },
      ],
      friction: 0.75,
      effect: 'slash_up', sound: 'sword_light', anim: 'up_light',
    },

    // ── Rasteira de lâmina (down light) ────────────────────────────────────────
    {
      id: 'low_sweep', name: 'Rasteira de Lâmina', direction: 'down', aerial: false,
      damage: 5, knockback: { base: 3.2, growth: 3.4, angle: 22 },
      startup: 5, active: 4, recovery: 13, cooldown: 6, range: 'medium',
      hitboxes: [{ x: 4, y: -12, w: 34, h: 12 }],
      friction: 0.8,
      effect: 'slash_low', sound: 'sword_light', anim: 'down_light',
    },

    // ── Golpe pesado (neutral/down heavy) — KO move ────────────────────────────
    {
      id: 'heavy_blow', name: 'Golpe Pesado', direction: 'neutral', aerial: false,
      damage: 16, knockback: { base: 5.6, growth: 9.4, angle: 42 },
      startup: 18, active: 5, recovery: 26, cooldown: 40, range: 'medium',
      hitboxes: [{ x: 4, y: -46, w: 36, h: 46 }],
      friction: 0.7, hitstopBonus: 3,
      effect: 'slash_heavy', sound: 'sword_heavy', anim: 'heavy',
    },

    // ── Avanço com espada (side heavy, ground & air) ───────────────────────────
    {
      id: 'sword_lunge', name: 'Avanço com Espada', direction: 'side', aerial: false,
      damage: 12, knockback: { base: 4.8, growth: 7.6, angle: 28 },
      startup: 12, active: 10, recovery: 22, cooldown: 45, range: 'long',
      hitboxes: [{ x: 6, y: -26, w: 30, h: 14 }],
      movement: [{ frame: 11, vx: 7.2, vy: 0 }, { frame: 22, vx: 1.5 }],
      gravityScale: 0.15, friction: 0.97, hitstopBonus: 2,
      effect: 'thrust', sound: 'sword_heavy', anim: 'lunge',
    },

    // ── Ascensão da lâmina (up heavy) — recuperação, 1x por tempo no ar ────────
    {
      id: 'blade_ascent', name: 'Ascensão da Lâmina', direction: 'up', aerial: false,
      damage: 10, knockback: { base: 4.6, growth: 6.4, angle: 80 },
      startup: 7, active: 12, recovery: 22, cooldown: 20, range: 'short',
      hitboxes: [{ x: -2, y: -52, w: 26, h: 52 }],
      movement: [{ frame: 7, vx: 1.4, vy: -8.4 }],
      recoveryMove: true, landingLag: 10, hitstopBonus: 1,
      effect: 'slash_up', sound: 'sword_heavy', anim: 'up_heavy',
    },

    // ── Aéreos ─────────────────────────────────────────────────────────────────
    {
      id: 'air_slash', name: 'Talho Aéreo', direction: 'side', aerial: true,
      damage: 7, knockback: { base: 3.2, growth: 4.6, angle: 40 },
      startup: 5, active: 5, recovery: 13, cooldown: 4, range: 'short',
      hitboxes: [{ x: -4, y: -42, w: 36, h: 36 }],
      landingLag: 6,
      effect: 'slash_arc', sound: 'sword_light', anim: 'air_light',
    },
    {
      id: 'air_rising', name: 'Corte Aéreo Ascendente', direction: 'up', aerial: true,
      damage: 6, knockback: { base: 3.4, growth: 4.0, angle: 86 },
      startup: 5, active: 5, recovery: 13, cooldown: 4, range: 'short',
      hitboxes: [{ x: -16, y: -60, w: 34, h: 26 }],
      landingLag: 6,
      effect: 'slash_up', sound: 'sword_light', anim: 'air_up',
    },
    {
      id: 'air_stab', name: 'Estocada Descendente', direction: 'down', aerial: true,
      damage: 8, knockback: { base: 3.0, growth: 4.4, angle: -65 },
      startup: 7, active: 6, recovery: 14, cooldown: 6, range: 'short',
      hitboxes: [{ x: -6, y: -6, w: 14, h: 22 }],
      landingLag: 10,
      effect: 'thrust_down', sound: 'sword_light', anim: 'air_down',
    },
    {
      id: 'knight_plunge', name: 'Queda do Cavaleiro', direction: 'down', aerial: true,
      damage: 13, knockback: { base: 4.6, growth: 6.6, angle: 55 },
      startup: 12, active: 40, recovery: 18, cooldown: 30, range: 'short',
      hitboxes: [{ x: -13, y: -12, w: 26, h: 20 }],
      movement: [{ frame: 0, vx: 0, vy: -2 }, { frame: 12, vx: 0, vy: 9 }],
      gravityScale: 0.3, untilLanding: true, landingLag: 18, hitstopBonus: 2,
      effect: 'plunge', sound: 'sword_heavy', anim: 'plunge',
    },
  ],

  moveset: {
    neutral_light: 'sword_combo_1',
    side_light: 'front_slash',
    up_light: 'rising_cut',
    down_light: 'low_sweep',
    neutral_heavy: 'heavy_blow',
    down_heavy: 'heavy_blow',
    side_heavy: 'sword_lunge',
    up_heavy: 'blade_ascent',
    air_neutral_light: 'air_slash',
    air_side_light: 'air_slash',
    air_up_light: 'air_rising',
    air_down_light: 'air_stab',
    air_neutral_heavy: 'sword_lunge',
    air_side_heavy: 'sword_lunge',
    air_up_heavy: 'blade_ascent',
    air_down_heavy: 'knight_plunge',
  },
};
