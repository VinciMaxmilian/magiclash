/**
 * MagiClash master palette — source of truth for every color in the game.
 * Keep in sync with docs/ASSETS.md §3. Ramps go dark → light with hue shifting.
 */
export const INK = 0x1a1422;

export const PAL = {
  ink: INK,
  steel: [0x2e3450, 0x4a5578, 0x7d8aa8, 0xb7c2d6, 0xeef2f7],
  gold: [0x6b3f2a, 0xa8683a, 0xd9a24e, 0xf2d27a],
  leather: [0x3b2420, 0x5e3a2b, 0x8a5a3c, 0xb5825a],
  skin: [0x6e3b33, 0xa8634e, 0xd99a7a, 0xf2c8a4],
  stone: [0x2a2733, 0x403c4c, 0x5b5668, 0x7b7588, 0xa29cab],
  moss: [0x1f3328, 0x2f4f35, 0x4d7040, 0x7a9a4f],
  wood: [0x3a2518, 0x5c3a22, 0x86582f, 0xb07d45],
  sky: [0x1f1b3a, 0x332a5c, 0x5a3f7a, 0x8f5b8c, 0xcc7a86, 0xeea57e, 0xfcd49a],
  fire: [0x5a1a10, 0xb8361e, 0xee6a26, 0xfbb03b, 0xfff1a8],
  ice: [0x1a3552, 0x2f6fa0, 0x5fb4de, 0xa8e4f5, 0xeafcff],
  lightning: [0x3b2a7a, 0x6a5ae0, 0xa8a0ff, 0xe8e4ff, 0xfffbe0],
  white: 0xffffff,
} as const;

export const TEAM_RAMPS = {
  blue: [0x1d2b5e, 0x2f4fa8, 0x4f86e0, 0x9cc6f5],
  red: [0x4a1420, 0x8c2230, 0xcf3f3a, 0xf28a6b],
  green: [0x1a3a24, 0x2f6b33, 0x56a33f, 0xa5d86a],
  yellow: [0x5a3a10, 0xa8741c, 0xe8b830, 0xfbe68a],
} as const;

export type TeamColor = keyof typeof TEAM_RAMPS;
export const TEAM_ORDER: TeamColor[] = ['blue', 'red', 'green', 'yellow'];

/** HUD damage color: white → yellow → orange → red → wine. */
export const damageColor = (damage: number): number => {
  const stops: [number, number][] = [
    [0, 0xeef2f7],
    [50, 0xfbe68a],
    [100, 0xee6a26],
    [150, 0xcf3f3a],
    [200, 0x8c2230],
  ];
  for (let i = stops.length - 1; i >= 0; i--) if (damage >= stops[i][0]) return stops[i][1];
  return stops[0][1];
};

export const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
