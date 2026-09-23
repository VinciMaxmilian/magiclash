import { PixelBuffer } from './pixelBuffer';
import { PAL, TEAM_RAMPS, type TeamColor } from './palette';

/**
 * Procedural "pixel puppet" for the Knight (placeholder art, docs/ASSETS.md).
 *
 * Every frame is drawn from the same fixed parts (helmet, torso, limbs with fixed lengths,
 * sword) posed by a few parameters, so proportions can't drift between frames. A 1px ink
 * outline is applied automatically. Final art replaces these textures keeping frame names.
 */

export const CELL = 64;
export const ANCHOR_X = 32;
export const ANCHOR_Y = 56;

type V2 = [number, number];

export interface KnightPose {
  /** Pelvis position relative to the feet anchor. */
  hip?: V2;
  /** Shoulder x offset relative to the pelvis (positive = leaning forward). */
  lean?: number;
  head?: V2;
  /** Ankle positions relative to the anchor. */
  fFoot?: V2;
  bFoot?: V2;
  /** [angle°, reach 0..1] — 0° forward, 90° down, -90° up. */
  fArm?: V2;
  bArm?: V2;
  sword?: number;
}

const DEFAULT: Required<KnightPose> = {
  hip: [0, -13],
  lean: 1,
  head: [0, 0],
  fFoot: [4, -2],
  bFoot: [-5, -2],
  fArm: [30, 0.75],
  bArm: [100, 0.7],
  sword: -55,
};

const THIGH = 7;
const SHIN = 7;
const UPPER_ARM = 5;
const FOREARM = 5;
const BLADE = 17;

const rad = (d: number) => (d * Math.PI) / 180;

/** Two-bone IK. `bend` = +1 bends clockwise (elbows down), -1 counter (knees forward). */
const ik = (a: V2, b: V2, l1: number, l2: number, bend: 1 | -1): V2 => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const base = Math.atan2(dy, dx);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = base + bend * Math.acos(Math.max(-1, Math.min(1, cosA)));
  return [a[0] + Math.cos(ang) * l1, a[1] + Math.sin(ang) * l1];
};

const HELMET = [
  '..bcccd..',
  '.bccdddd.',
  'bccdddddd',
  'bccccccdd',
  'bcckkkkkd',
  'bccccckcd',
  'bcccccckd',
  'bbccccccd',
  '.ggggggg.',
];

const PLUME = [
  '....ut',
  '.tttTu',
  'tTT...',
  'T.....',
];

export const drawKnight = (pose: KnightPose, team: TeamColor): PixelBuffer => {
  const p = { ...DEFAULT, ...pose };
  const buf = new PixelBuffer(CELL, CELL);
  const S = PAL.steel;
  const T = TEAM_RAMPS[team];
  const L = PAL.leather;
  const G = PAL.gold;
  const ax = ANCHOR_X;
  const ay = ANCHOR_Y;

  const hip: V2 = [ax + p.hip[0], ay + p.hip[1]];
  const top: V2 = [hip[0] + p.lean, hip[1] - 10]; // torso top center
  const fShoulder: V2 = [top[0] + 1, top[1] + 1];
  const bShoulder: V2 = [top[0] - 2, top[1] + 1];
  const armLen = UPPER_ARM + FOREARM;
  const hand = (sh: V2, arm: V2): V2 => [
    sh[0] + Math.cos(rad(arm[0])) * arm[1] * armLen,
    sh[1] + Math.sin(rad(arm[0])) * arm[1] * armLen,
  ];
  const fHand = hand(fShoulder, p.fArm);
  const bHand = hand(bShoulder, p.bArm);

  const limb = (a: V2, b: V2, l1: number, l2: number, bend: 1 | -1, w: number, c: number, hi: number) => {
    const j = ik(a, b, l1, l2, bend);
    buf.line(a[0], a[1], j[0], j[1], c, w);
    buf.line(j[0], j[1], b[0], b[1], c, w);
    buf.line(a[0], a[1] - 1, j[0], j[1] - 1, hi, 1);
    return j;
  };

  const boot = (f: V2, dark: boolean) => {
    const x = Math.round(f[0]);
    const y = Math.round(f[1]);
    buf.rect(x - 2, y, 5, 2, dark ? L[0] : L[1]);
    buf.rect(x - 2, y, 4, 1, dark ? L[1] : L[2]);
  };

  // 1. Back arm (shadowed)
  limb(bShoulder, bHand, UPPER_ARM, FOREARM, 1, 3, S[1], S[1]);
  buf.rect(Math.round(bHand[0]) - 1, Math.round(bHand[1]) - 1, 3, 3, S[0]);

  // 2. Back leg
  limb([hip[0] - 2, hip[1]], [ax + p.bFoot[0], ay + p.bFoot[1]], THIGH, SHIN, -1, 4, S[1], S[1]);
  boot([ax + p.bFoot[0], ay + p.bFoot[1]], true);

  // 3. Torso: plate armour with team tabard and belt
  for (let r = 0; r < 11; r++) {
    const t = r / 10;
    const cx = Math.round(top[0] + (hip[0] - top[0]) * t);
    const y = Math.round(top[1] + r);
    const w = r < 2 ? 8 : 10;
    const x0 = cx - Math.floor(w / 2);
    buf.rect(x0, y, w, 1, S[2]);
    buf.set(x0, y, S[1]);
    buf.set(x0 + 1, y, S[1]);
    buf.set(x0 + w - 1, y, S[3]);
    if (r >= 3 && r <= 10) {
      buf.rect(cx, y, 3, 1, T[r < 5 ? 2 : 1]);
      buf.set(cx + 1, y, T[r < 5 ? 3 : 2]);
    }
    if (r === 9) {
      buf.rect(x0, y, w, 1, L[1]);
      buf.set(cx + 1, y, G[3]);
    }
  }
  // chest highlight
  buf.set(top[0] + 3, top[1] + 2, S[4]);
  buf.set(top[0] + 3, top[1] + 3, S[3]);
  // tabard tail over the thighs
  buf.rect(Math.round(hip[0]), Math.round(hip[1]) + 1, 3, 3, T[1]);
  buf.set(Math.round(hip[0]) + 1, Math.round(hip[1]) + 1, T[2]);

  // 4. Front leg
  limb([hip[0] + 1, hip[1]], [ax + p.fFoot[0], ay + p.fFoot[1]], THIGH, SHIN, -1, 4, S[2], S[3]);
  boot([ax + p.fFoot[0], ay + p.fFoot[1]], false);

  // 5. Head: great helm + plume
  const hx = Math.round(top[0] + p.head[0]) - 4;
  const hy = Math.round(top[1] + p.head[1]) - 9;
  buf.stamp(hx, hy, HELMET, { b: S[1], c: S[2], d: S[3], k: PAL.ink, g: G[2] });
  buf.set(hx + 6, hy + 1, S[4]);
  buf.stamp(hx - 3, hy - 3, PLUME, { T: T[1], t: T[2], u: T[3] });

  // 6. Sword in the front hand
  const sd: V2 = [Math.cos(rad(p.sword)), Math.sin(rad(p.sword))];
  const perp: V2 = [-sd[1], sd[0]];
  const bx = fHand[0] + sd[0] * 2;
  const by = fHand[1] + sd[1] * 2;
  const tx = fHand[0] + sd[0] * (BLADE + 2);
  const ty = fHand[1] + sd[1] * (BLADE + 2);
  buf.line(bx, by, tx, ty, S[3], 2);
  buf.line(bx - perp[0] * 0.6, by - perp[1] * 0.6, tx - perp[0] * 0.6, ty - perp[1] * 0.6, S[4], 1);
  buf.set(tx + sd[0], ty + sd[1], S[4]);
  buf.line(bx - perp[0] * 3, by - perp[1] * 3, bx + perp[0] * 3, by + perp[1] * 3, G[2], 1);
  buf.set(bx - perp[0] * 3, by - perp[1] * 3, G[1]);
  buf.line(fHand[0], fHand[1], fHand[0] - sd[0] * 2, fHand[1] - sd[1] * 2, L[1], 2);
  buf.set(fHand[0] - sd[0] * 3, fHand[1] - sd[1] * 3, G[3]);

  // 7. Front arm over the grip, pauldron, gauntlet
  limb(fShoulder, fHand, UPPER_ARM, FOREARM, 1, 3, S[2], S[3]);
  buf.disc(fShoulder[0], fShoulder[1], 2, S[2]);
  buf.set(fShoulder[0], fShoulder[1] - 2, S[4]);
  buf.set(fShoulder[0] + 1, fShoulder[1] - 1, S[3]);
  buf.rect(Math.round(fHand[0]) - 1, Math.round(fHand[1]) - 1, 3, 3, S[2]);
  buf.set(Math.round(fHand[0]), Math.round(fHand[1]) - 1, S[3]);

  buf.outline();
  return buf;
};

// ── Animations ──────────────────────────────────────────────────────────────

export interface AttackAnim {
  startup: KnightPose[];
  active: KnightPose[];
  recovery: KnightPose[];
}

const TUCK: KnightPose = { fFoot: [3, -6], bFoot: [-4, -4] };

export const KNIGHT_LOOPS: Record<string, KnightPose[]> = {
  idle: [
    {},
    { fArm: [31, 0.75], sword: -54 },
    { hip: [0, -12], fArm: [34, 0.74], sword: -51 },
    { hip: [0, -12], fArm: [33, 0.74], sword: -52 },
  ],
  run: [
    { hip: [0, -13], lean: 3, fFoot: [7, -3], bFoot: [-6, -2], fArm: [40, 0.75], bArm: [120, 0.7], sword: 20 },
    { hip: [0, -14], lean: 3, fFoot: [3, -2], bFoot: [-4, -5], fArm: [50, 0.75], bArm: [95, 0.7], sword: 25 },
    { hip: [0, -13], lean: 3, fFoot: [-2, -2], bFoot: [2, -6], fArm: [60, 0.75], bArm: [75, 0.7], sword: 30 },
    { hip: [0, -13], lean: 3, fFoot: [-6, -2], bFoot: [7, -3], fArm: [60, 0.75], bArm: [70, 0.7], sword: 30 },
    { hip: [0, -14], lean: 3, fFoot: [-4, -5], bFoot: [3, -2], fArm: [50, 0.75], bArm: [95, 0.7], sword: 25 },
    { hip: [0, -13], lean: 3, fFoot: [2, -6], bFoot: [-2, -2], fArm: [40, 0.75], bArm: [120, 0.7], sword: 20 },
  ],
  jump: [{ hip: [0, -14], fFoot: [3, -6], bFoot: [-4, -3], fArm: [10, 0.8], bArm: [-150, 0.7], sword: -70 }],
  fall: [{ hip: [0, -14], fFoot: [4, -3], bFoot: [-3, -6], fArm: [40, 0.8], bArm: [-120, 0.7], sword: -30 }],
  land: [{ hip: [0, -10], lean: 2, fFoot: [5, -2], bFoot: [-6, -2], fArm: [40, 0.7], bArm: [100, 0.6], sword: -40 }],
  dodge: [{ hip: [0, -11], lean: -1, fFoot: [4, -2], bFoot: [-6, -2], fArm: [60, 0.5], bArm: [60, 0.5], sword: -80 }],
  hitstun: [
    { hip: [-1, -13], lean: -3, head: [-1, 0], fFoot: [3, -2], bFoot: [-5, -3], fArm: [-30, 0.8], bArm: [-140, 0.8], sword: -120 },
  ],
  tumble: [
    { hip: [0, -14], lean: -2, head: [-1, 1], fFoot: [5, -7], bFoot: [-4, -4], fArm: [-60, 0.9], bArm: [-150, 0.8], sword: 160 },
  ],
};

export const KNIGHT_ATTACKS: Record<string, AttackAnim> = {
  jab1: {
    startup: [{ fArm: [-40, 0.6], sword: -110 }],
    active: [{ fArm: [0, 1], sword: 5, lean: 2, fFoot: [6, -2] }],
    recovery: [{ fArm: [30, 0.9], sword: 45, lean: 1 }],
  },
  jab2: {
    startup: [{ fArm: [60, 0.7], sword: 100 }],
    active: [{ fArm: [-20, 1], sword: -40, lean: 2, fFoot: [6, -2] }],
    recovery: [{ fArm: [-50, 0.8], sword: -80 }],
  },
  jab3: {
    startup: [
      { fArm: [-110, 0.8], sword: -150, lean: -1 },
      { fArm: [-120, 0.9], sword: -170, lean: -2, bArm: [-120, 0.7] },
    ],
    active: [{ fArm: [0, 1], sword: 20, lean: 3, hip: [1, -11], fFoot: [8, -2] }],
    recovery: [
      { fArm: [40, 0.9], sword: 60, lean: 3, hip: [1, -11], fFoot: [8, -2] },
      { fArm: [35, 0.8], sword: 40, lean: 2 },
    ],
  },
  side_light: {
    startup: [{ fArm: [-60, 0.6], sword: -120, lean: -1 }],
    active: [{ fArm: [-5, 1], sword: -5, lean: 3, fFoot: [8, -2], bFoot: [-7, -2] }],
    recovery: [{ fArm: [20, 1], sword: 25, lean: 2, fFoot: [8, -2] }],
  },
  up_light: {
    startup: [{ fArm: [60, 0.8], sword: 60, hip: [0, -11], lean: 1 }],
    active: [
      { fArm: [-50, 1], sword: -60, lean: 0, hip: [0, -14] },
      { fArm: [-100, 1], sword: -100, lean: -1, hip: [0, -14] },
    ],
    recovery: [{ fArm: [-110, 0.8], sword: -130, lean: -1 }],
  },
  down_light: {
    startup: [{ hip: [0, -9], fArm: [0, 0.6], sword: -30, fFoot: [6, -2], bFoot: [-8, -2] }],
    active: [{ hip: [0, -8], lean: 3, fArm: [40, 1], sword: 12, fFoot: [9, -2], bFoot: [-9, -2] }],
    recovery: [{ hip: [0, -9], lean: 2, fArm: [50, 0.9], sword: 30, fFoot: [8, -2], bFoot: [-8, -2] }],
  },
  heavy: {
    startup: [
      { fArm: [-120, 0.8], sword: -160, lean: -2, bArm: [-120, 0.8] },
      { fArm: [-130, 0.9], sword: -175, lean: -3, hip: [-1, -13], bArm: [-130, 0.9] },
    ],
    active: [{ fArm: [30, 1], sword: 35, lean: 4, hip: [2, -10], fFoot: [9, -2], bFoot: [-7, -2], bArm: [30, 0.9] }],
    recovery: [
      { fArm: [60, 1], sword: 70, lean: 4, hip: [2, -9], fFoot: [9, -2], bArm: [60, 0.9] },
      { fArm: [50, 0.8], sword: 55, lean: 2, hip: [1, -11] },
    ],
  },
  lunge: {
    startup: [{ hip: [-1, -11], lean: -1, fArm: [120, 0.6], sword: 0, fFoot: [6, -2], bFoot: [-8, -2] }],
    active: [{ hip: [2, -11], lean: 5, fArm: [0, 1], sword: 0, fFoot: [10, -2], bFoot: [-9, -2], bArm: [170, 0.9] }],
    recovery: [{ hip: [1, -12], lean: 3, fArm: [10, 0.9], sword: 10, fFoot: [8, -2], bFoot: [-7, -2] }],
  },
  up_heavy: {
    startup: [{ hip: [0, -9], fArm: [70, 0.8], sword: 80, fFoot: [5, -2], bFoot: [-6, -2] }],
    active: [{ hip: [0, -14], fArm: [-90, 1], sword: -90, fFoot: [2, -7], bFoot: [-3, -4], bArm: [-100, 0.8] }],
    recovery: [{ fArm: [-70, 0.9], sword: -60, fFoot: [3, -5], bFoot: [-3, -3] }],
  },
  air_light: {
    startup: [{ fArm: [-90, 0.8], sword: -120, ...TUCK }],
    active: [
      { fArm: [20, 1], sword: 30, lean: 2, fFoot: [4, -5], bFoot: [-4, -4] },
      { fArm: [60, 1], sword: 80, fFoot: [4, -5], bFoot: [-4, -4] },
    ],
    recovery: [{ fArm: [80, 0.8], sword: 110, fFoot: [3, -4], bFoot: [-4, -3] }],
  },
  air_up: {
    startup: [{ fArm: [50, 0.8], sword: 60, ...TUCK }],
    active: [
      { fArm: [-80, 1], sword: -85, ...TUCK },
      { fArm: [-120, 1], sword: -140, ...TUCK },
    ],
    recovery: [{ fArm: [-140, 0.8], sword: -160, ...TUCK }],
  },
  air_down: {
    startup: [{ fArm: [-60, 0.7], sword: -90, fFoot: [4, -8], bFoot: [-4, -6] }],
    active: [{ fArm: [90, 1], sword: 90, fFoot: [4, -9], bFoot: [-4, -8], bArm: [80, 0.9] }],
    recovery: [{ fArm: [80, 0.9], sword: 85, fFoot: [3, -6], bFoot: [-4, -5] }],
  },
  plunge: {
    startup: [{ hip: [0, -15], fArm: [-90, 0.8], sword: -90, bArm: [-90, 0.8], fFoot: [3, -8], bFoot: [-4, -8] }],
    active: [{ hip: [0, -14], fArm: [90, 1], sword: 90, bArm: [90, 1], fFoot: [4, -10], bFoot: [-4, -10] }],
    recovery: [{ hip: [0, -10], lean: 2, fArm: [80, 1], sword: 85, fFoot: [6, -2], bFoot: [-6, -2] }],
  },
};

/** Flat list of every frame: name → pose. Names are stable (final art keeps them). */
export const knightFrameList = (): { name: string; pose: KnightPose }[] => {
  const out: { name: string; pose: KnightPose }[] = [];
  for (const [anim, poses] of Object.entries(KNIGHT_LOOPS)) {
    poses.forEach((pose, i) => out.push({ name: `${anim}_${i}`, pose }));
  }
  for (const [anim, a] of Object.entries(KNIGHT_ATTACKS)) {
    (['startup', 'active', 'recovery'] as const).forEach((phase) =>
      a[phase].forEach((pose, i) => out.push({ name: `${anim}_${phase}_${i}`, pose })),
    );
  }
  return out;
};
