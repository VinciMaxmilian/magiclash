import { PixelBuffer } from './pixelBuffer';
import { PAL, TEAM_RAMPS, type TeamColor } from './palette';
import { KNIGHT_ATTACKS, KNIGHT_LOOPS, type AttackAnim, type KnightPose } from './knightSprite';

/**
 * Procedural "pixel puppet" for every class (placeholder art, docs/ASSETS.md).
 *
 * All characters share one skeleton and one pose vocabulary; a FighterStyle picks the parts
 * (head, torso, arms, legs, weapon) and the body proportions. Limb lengths and head size are
 * fixed per style, so proportions never drift between frames. 1px ink outline is automatic.
 */

export const CELL = 64;
export const ANCHOR_X = 32;
export const ANCHOR_Y = 56;

type V2 = [number, number];
type Ramp = readonly number[];

export interface Pose extends KnightPose {
  /** Bow draw 0..1 (string pulled back toward the back hand). */
  draw?: number;
  /** Hide the weapon for this pose (thrown axe, bare-hand moves). */
  noWeapon?: boolean;
  /** Whip uncoiled: only the handle is drawn (the lash itself is an effect sprite). */
  whipOut?: boolean;
}

export type WeaponKind = 'sword' | 'axe' | 'bow' | 'staff' | 'whip' | 'chainwhip' | 'none';

export interface FighterStyle {
  id: string;
  head: 'greathelm' | 'horned' | 'hood' | 'wizard' | 'hunter' | 'brawler' | 'vampire' | 'dhampir' | 'summoner';
  torso: 'plate' | 'bare' | 'tunic' | 'robe' | 'coat' | 'dress';
  arms: 'plate' | 'bare' | 'sleeve' | 'robe' | 'coat';
  legs: 'plate' | 'fur' | 'pants' | 'robe' | 'coat' | 'stockings';
  weapon: WeaponKind;
  cape: boolean;
  /** Robe/hat color (mages) and staff orb color. */
  robe?: Ramp;
  orb?: Ramp;
  size: { thigh: number; shin: number; upper: number; fore: number; torsoH: number; torsoW: number; hipDy: number };
  family: 'melee' | 'bow' | 'staff';
  /** Weapon can be thrown: also generate weaponless variants (prefix `u_`). */
  throwable?: boolean;
  /** Temporada 1 outfits: clothing ramp (coat / dress), hair ramp, pale skin, details. */
  coat?: Ramp;
  hair?: Ramp;
  pale?: boolean;
  collar?: 'fur' | 'high';
  /** Color of the coat's front trim (gold / silver). */
  trim?: number;
  /** Rows of coat tail hanging over the thighs. */
  coatTail?: number;
  /** Long flowing cape (team-colored lining) instead of the knight's short one. */
  bigCape?: boolean;
  /** Eye color (glowing eyes for the night creatures). */
  eye?: number;
}

const ROBE_FIRE: Ramp = [0x3b2420, 0x5a1a10, 0xb8361e, 0xee6a26];
const ROBE_ICE: Ramp = [0x1a3552, 0x2f6fa0, 0x5fb4de, 0xa8e4f5];
const ROBE_BOLT: Ramp = [0x1f1b3a, 0x3b2a7a, 0x6a5ae0, 0xa8a0ff];

const BASE_SIZE = { thigh: 7, shin: 7, upper: 5, fore: 5, torsoH: 10, torsoW: 10, hipDy: 0 };

// Temporada 1 ramps (all from the master palette)
const COAT_HUNTER: Ramp = [PAL.leather[0], PAL.leather[1], PAL.leather[2], PAL.leather[3]];
const COAT_BRAWLER: Ramp = [PAL.steel[0], PAL.steel[1], PAL.steel[2], PAL.steel[3]];
const COAT_VAMPIRE: Ramp = [PAL.ink, PAL.sky[0], PAL.sky[1], PAL.sky[2]];
const COAT_DHAMPIR: Ramp = [PAL.ink, PAL.stone[0], PAL.stone[1], PAL.stone[2]];
const DRESS_SUMMONER: Ramp = [PAL.ice[0], PAL.ice[1], PAL.ice[2], PAL.ice[3]];
const HAIR_DARK: Ramp = [PAL.wood[0], PAL.wood[1], PAL.wood[2], PAL.wood[3]];
const HAIR_BROWN: Ramp = [PAL.leather[1], PAL.wood[2], PAL.wood[3], PAL.gold[2]];
const HAIR_BLACK: Ramp = [PAL.ink, PAL.sky[1], PAL.sky[2], PAL.stone[3]];
const HAIR_SILVER: Ramp = [PAL.stone[2], PAL.stone[4], PAL.steel[3], PAL.steel[4]];
const HAIR_BLONDE: Ramp = [PAL.gold[1], PAL.gold[2], PAL.gold[3], PAL.sky[6]];
const PALE: Ramp = [PAL.skin[1], PAL.skin[2], PAL.skin[3], PAL.sky[6]];

export const STYLES: Record<string, FighterStyle> = {
  knight: { id: 'knight', head: 'greathelm', torso: 'plate', arms: 'plate', legs: 'plate', weapon: 'sword', cape: true, size: BASE_SIZE, family: 'melee' },
  barbarian: {
    id: 'barbarian', head: 'horned', torso: 'bare', arms: 'bare', legs: 'fur', weapon: 'axe', cape: false,
    size: { thigh: 8, shin: 8, upper: 6, fore: 5, torsoH: 11, torsoW: 12, hipDy: -2 }, family: 'melee', throwable: true,
  },
  archer: {
    id: 'archer', head: 'hood', torso: 'tunic', arms: 'sleeve', legs: 'pants', weapon: 'bow', cape: false,
    size: { thigh: 7, shin: 7, upper: 5, fore: 5, torsoH: 9, torsoW: 8, hipDy: 0 }, family: 'bow',
  },
  fire_mage: { id: 'fire_mage', head: 'wizard', torso: 'robe', arms: 'robe', legs: 'robe', weapon: 'staff', cape: false, robe: ROBE_FIRE, orb: PAL.fire, size: { ...BASE_SIZE, torsoW: 9 }, family: 'staff' },
  ice_mage: { id: 'ice_mage', head: 'wizard', torso: 'robe', arms: 'robe', legs: 'robe', weapon: 'staff', cape: false, robe: ROBE_ICE, orb: PAL.ice, size: { ...BASE_SIZE, torsoW: 9 }, family: 'staff' },
  lightning_mage: { id: 'lightning_mage', head: 'wizard', torso: 'robe', arms: 'robe', legs: 'robe', weapon: 'staff', cape: false, robe: ROBE_BOLT, orb: PAL.lightning, size: { ...BASE_SIZE, torsoW: 9 }, family: 'staff' },
  // ── Temporada 1 ──
  hunter: {
    id: 'hunter', head: 'hunter', torso: 'coat', arms: 'coat', legs: 'pants', weapon: 'chainwhip', cape: false,
    coat: COAT_HUNTER, hair: HAIR_DARK, collar: 'fur', coatTail: 7, size: BASE_SIZE, family: 'melee',
  },
  brawler: {
    id: 'brawler', head: 'brawler', torso: 'coat', arms: 'coat', legs: 'pants', weapon: 'whip', cape: false,
    coat: COAT_BRAWLER, hair: HAIR_BROWN, coatTail: 4, trim: PAL.steel[4],
    size: { ...BASE_SIZE, torsoW: 9 }, family: 'melee',
  },
  vampire: {
    id: 'vampire', head: 'vampire', torso: 'coat', arms: 'coat', legs: 'coat', weapon: 'none', cape: false,
    coat: COAT_VAMPIRE, hair: HAIR_BLACK, pale: true, collar: 'high', trim: PAL.gold[2], coatTail: 9, bigCape: true,
    eye: PAL.fire[2], size: { thigh: 8, shin: 8, upper: 6, fore: 6, torsoH: 12, torsoW: 11, hipDy: -2 }, family: 'staff',
  },
  dhampir: {
    id: 'dhampir', head: 'dhampir', torso: 'coat', arms: 'coat', legs: 'coat', weapon: 'sword', cape: false,
    coat: COAT_DHAMPIR, hair: HAIR_SILVER, pale: true, trim: PAL.steel[3], coatTail: 10, eye: PAL.gold[3],
    size: { thigh: 8, shin: 7, upper: 5, fore: 5, torsoH: 11, torsoW: 9, hipDy: -1 }, family: 'melee',
  },
  summoner: {
    id: 'summoner', head: 'summoner', torso: 'dress', arms: 'coat', legs: 'stockings', weapon: 'none', cape: false,
    coat: DRESS_SUMMONER, hair: HAIR_BLONDE, size: { thigh: 6, shin: 6, upper: 4, fore: 5, torsoH: 8, torsoW: 8, hipDy: 0 }, family: 'staff',
  },
};

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

const rad = (d: number) => (d * Math.PI) / 180;

const ik = (a: V2, b: V2, l1: number, l2: number, bend: 1 | -1): V2 => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const base = Math.atan2(dy, dx);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = base + bend * Math.acos(Math.max(-1, Math.min(1, cosA)));
  return [a[0] + Math.cos(ang) * l1, a[1] + Math.sin(ang) * l1];
};

// ── Head maps (facing right) ───────────────────────────────────────────────

const GREATHELM = ['..bcccd..', '.bccdddd.', 'bccdddddd', 'bccccccdd', 'bcckkkkkd', 'bccccckcd', 'bcccccckd', 'bbccccccd', '.ggggggg.'];
const PLUME = ['....ut', '.tttTu', 'tTT...', 'T.....'];
const HORNED = [
  'h...........h',
  'h...........h',
  'hH.........Hh',
  '.hHHcccddHHh.',
  '...ccccdddd..',
  '...sssssSss..',
  '...ssssskss..',
  '...bsssssss..',
  '...bbbssbbb..',
  '....bbbbbb...',
  '.....bbbb....',
];
const HOOD = [
  '..TTTTT...',
  '.TTTTTtt..',
  'TTTTttttt.',
  'TTTTDsssu.',
  'TTTDssskt.',
  'TTTDsssst.',
  'TTTTDssT..',
  '.TTTTTTT..',
  '..TTTTT...',
];

// Temporada 1 heads. h/H/i/j = hair ramp, s/S = skin, b = beard, k = eye, T/t = team color.
const HEAD_HUNTER = [
  '..hhhhh...',
  '.hhiiihh..',
  'hhiijiihh.',
  'hhhsssshh.',
  'hhsssksh..',
  'hhssssS...',
  '.hbsbbss..',
  '..bbbbb...',
];
const HEAD_BRAWLER = [
  '..hhhhh...',
  '.hhiijih..',
  'tTTTTTTTT.',
  'thhsssss..',
  '..hsssks..',
  '..hssssS..',
  '...sssss..',
  '...ssss...',
];
const HEAD_VAMPIRE = [
  '...hhhhh...',
  '..hiiiiih..',
  '.hijjiiihh.',
  '.hiissssh..',
  '.hhsssks...',
  '.hhssssS...',
  '.hhhbsss...',
  '.hhhbbbb...',
  '.hih.bb....',
  '.hh........',
];
const HEAD_DHAMPIR = [
  '..hhhhhh...',
  '.hiiijjih..',
  'hiijjiiih..',
  'hiiissss...',
  'hiisssks...',
  'hiissssS...',
  'hiiisssh...',
  'hii..ss....',
  'hii........',
  'hi.........',
  '.h.........',
];
const HEAD_SUMMONER = [
  'TT......',
  'TtThhhh.',
  '.Thiijhh',
  '.hhiisss',
  '.hhssskS',
  '.hhsssss',
  '.hh.sss.',
  '.h......',
];

export const drawFighter = (pose: Pose, style: FighterStyle, team: TeamColor): PixelBuffer => {
  const p = { ...DEFAULT, ...pose };
  const z = style.size;
  const buf = new PixelBuffer(CELL, CELL);
  const S = PAL.steel;
  const T = TEAM_RAMPS[team];
  const L = PAL.leather;
  const G = PAL.gold;
  const K = style.pale ? PALE : PAL.skin;
  const W = PAL.wood;
  const R = style.robe ?? S;
  const C = style.coat ?? L;
  const Hr = style.hair ?? HAIR_DARK;
  const ax = ANCHOR_X;
  const ay = ANCHOR_Y;

  const hip: V2 = [ax + p.hip[0], ay + p.hip[1] + z.hipDy];
  const top: V2 = [hip[0] + p.lean, hip[1] - z.torsoH];
  const fShoulder: V2 = [top[0] + 1, top[1] + 1];
  const bShoulder: V2 = [top[0] - 2, top[1] + 1];
  const armLen = z.upper + z.fore;
  const hand = (sh: V2, arm: V2): V2 => [
    sh[0] + Math.cos(rad(arm[0])) * arm[1] * armLen,
    sh[1] + Math.sin(rad(arm[0])) * arm[1] * armLen,
  ];
  const fHand = hand(fShoulder, p.fArm);
  const wd: V2 = [Math.cos(rad(p.sword)), Math.sin(rad(p.sword))];
  const perp: V2 = [-wd[1], wd[0]];
  const hasWeapon = !p.noWeapon;
  // Bow draw: the back hand holds the string.
  const drawAmt = style.weapon === 'bow' && hasWeapon ? (p.draw ?? 0) : 0;
  const stringPt: V2 = [fHand[0] - wd[0] * (3 + drawAmt * 9), fHand[1] - wd[1] * (3 + drawAmt * 9)];
  const bHand = drawAmt > 0 ? stringPt : hand(bShoulder, p.bArm);

  const limb = (a: V2, b: V2, l1: number, l2: number, bend: 1 | -1, w: number, c: number, hi: number, border?: number) => {
    const j = ik(a, b, l1, l2, bend);
    if (border !== undefined) {
      buf.line(a[0], a[1], j[0], j[1], border, w + 2);
      buf.line(j[0], j[1], b[0], b[1], border, w + 2);
    }
    buf.line(a[0], a[1], j[0], j[1], c, w);
    buf.line(j[0], j[1], b[0], b[1], c, w);
    buf.line(a[0], a[1] - 1, j[0], j[1] - 1, hi, 1);
    return j;
  };

  const legColors = (front: boolean): [number, number, number, number] => {
    switch (style.legs) {
      case 'coat': return front ? [C[1], C[2], C[0], PAL.ink] : [C[0], C[1], C[0], PAL.ink];
      case 'stockings': return front ? [S[3], S[4], S[1], L[1]] : [S[2], S[3], S[1], L[0]];
      case 'fur': return front ? [L[1], L[2], L[0], W[1]] : [L[0], L[1], L[0], W[0]];
      case 'pants': return front ? [W[1], W[2], W[0], L[1]] : [W[0], W[1], W[0], L[0]];
      case 'robe': return front ? [L[0], L[1], PAL.ink, L[1]] : [L[0], L[0], PAL.ink, L[0]];
      default: return front ? [S[2], S[3], S[0], L[1]] : [S[1], S[1], S[0], L[0]];
    }
  };
  const armColors = (front: boolean): [number, number, number, number] => {
    switch (style.arms) {
      case 'bare': return front ? [K[2], K[3], K[0], L[1]] : [K[1], K[1], K[0], L[0]];
      case 'sleeve': return front ? [L[1], L[2], L[0], K[2]] : [L[0], L[1], L[0], K[1]];
      case 'robe': return front ? [R[2], R[3], R[0], K[2]] : [R[1], R[1], R[0], K[1]];
      case 'coat': return front ? [C[2], C[3], C[0], K[2]] : [C[1], C[1], C[0], K[1]];
      default: return front ? [S[1], S[2], S[0], L[1]] : [S[0], S[1], S[0], L[0]];
    }
  };

  const boot = (f: V2, c: number, hi: number) => {
    const x = Math.round(f[0]);
    const y = Math.round(f[1]);
    buf.rect(x - 2, y, 5, 2, c);
    buf.rect(x - 2, y, 4, 1, hi);
  };

  // 0. Things behind the body: cape, quiver
  if (style.bigCape) {
    // Long cape from the shoulders to the ankles, flaring back; team-colored lining on the edge.
    const rows = Math.round(ay - top[1]) - 1;
    for (let r = 0; r < rows; r++) {
      const y = Math.round(top[1] - 1 + r);
      const t = r / (rows - 1);
      const right = Math.round(top[0] + 1 + (hip[0] - 2 - top[0]) * t - p.lean * 0.6 * t);
      const w = 5 + Math.floor(t * 9);
      buf.rect(right - w, y, w + 1, 1, C[1]);
      buf.rect(right - w, y, 2, 1, T[1]);
      buf.set(right - w, y, T[0]);
      if (r % 5 === 2) buf.set(right - w + 4, y, C[0]); // folds
      if (r === rows - 1) buf.rect(right - w, y, w + 1, 1, T[0]);
    }
  }
  if (style.collar === 'high') {
    // Standing collar behind the head.
    for (let r = 0; r < 7; r++) {
      const y = Math.round(top[1] - 1 - r);
      const w = 4 + Math.floor(r / 2);
      buf.rect(Math.round(top[0]) - 3 - w, y, w, 1, r > 4 ? T[1] : C[1]);
      buf.set(Math.round(top[0]) - 3 - w, y, T[0]);
    }
  }
  if (style.cape) {
    for (let r = 0; r < 14; r++) {
      const y = Math.round(top[1] + 1 + r);
      const t = r / 13;
      const right = Math.round(top[0] - 2 + (hip[0] - 4 - (top[0] - 2)) * t - p.lean * 0.4 * t);
      const w = 3 + Math.floor(r / 4);
      buf.rect(right - w, y, w + 1, 1, T[1]);
      buf.set(right - w, y, T[0]);
      if (r === 13) buf.rect(right - w, y, w + 1, 1, T[0]);
    }
  }
  if (style.torso === 'tunic') {
    // quiver across the back with team-colored fletchings
    const qx = Math.round(top[0] - 4);
    const qy = Math.round(top[1] - 1);
    buf.line(qx, qy, qx - 3, qy + 11, W[1], 3);
    buf.line(qx + 1, qy, qx - 2, qy + 11, W[2], 1);
    buf.set(qx - 1, qy - 2, T[2]);
    buf.set(qx + 1, qy - 3, T[3]);
    buf.set(qx + 2, qy - 2, T[2]);
  }

  // 1. Back arm
  {
    const [c, hi, , handC] = armColors(false);
    limb(bShoulder, bHand, z.upper, z.fore, 1, style.arms === 'robe' ? 4 : 3, c, hi);
    buf.rect(Math.round(bHand[0]) - 1, Math.round(bHand[1]) - 1, 3, 3, handC);
  }

  // 2. Back leg
  {
    const [c, hi, , bootC] = legColors(false);
    limb([hip[0] - 2, hip[1]], [ax + p.bFoot[0], ay + p.bFoot[1]], z.thigh, z.shin, -1, 4, c, hi);
    boot([ax + p.bFoot[0], ay + p.bFoot[1]], bootC, bootC);
  }

  // 2b. Coat tail over the thighs (behind the front leg).
  if (style.coatTail) {
    for (let r = 0; r < style.coatTail; r++) {
      const w = z.torsoW + Math.floor(r * 0.5);
      const x0 = Math.round(hip[0]) - Math.floor(w / 2) - Math.floor(r * 0.3);
      const y = Math.round(hip[1]) + r;
      buf.rect(x0, y, w, 1, C[1]);
      buf.set(x0, y, C[0]);
      buf.set(x0 + w - 1, y, C[2]);
      if (style.trim !== undefined && r === style.coatTail - 1) buf.rect(x0, y, w, 1, style.trim);
    }
  }

  // 3. Torso
  const torsoRow = (r: number) => {
    const t = r / z.torsoH;
    const cx = Math.round(top[0] + (hip[0] - top[0]) * t);
    return { cx, y: Math.round(top[1] + r) };
  };
  for (let r = 0; r <= z.torsoH; r++) {
    const { cx, y } = torsoRow(r);
    const w = r < 2 ? z.torsoW - 2 : z.torsoW;
    const x0 = cx - Math.floor(w / 2);
    const belt = r === z.torsoH - 1;
    switch (style.torso) {
      case 'plate':
        buf.rect(x0, y, w, 1, S[2]);
        buf.set(x0, y, S[1]);
        buf.set(x0 + 1, y, S[1]);
        buf.set(x0 + w - 1, y, S[3]);
        if (r >= 2) {
          buf.rect(cx - 1, y, 4, 1, T[1]);
          buf.set(cx + 2, y, T[2]);
          if (r === 2) buf.rect(cx - 1, y, 4, 1, T[2]);
        }
        if (r === 5 || r === 6) buf.set(cx, y, G[3]);
        if (belt) {
          buf.rect(x0, y, w, 1, L[1]);
          buf.set(cx + 1, y, G[3]);
        }
        break;
      case 'bare':
        buf.rect(x0, y, w, 1, K[2]);
        buf.set(x0 + w - 1, y, K[3]);
        if (r === 4 || r === 7) buf.set(cx + 2, y, K[1]); // muscle lines
        // fur vest on the back half
        buf.rect(x0, y, Math.floor(w / 2) - 1, 1, r % 3 === 0 ? L[1] : L[0]);
        buf.set(x0 + Math.floor(w / 2) - 1, y, r % 2 ? W[2] : L[1]);
        if (belt) buf.rect(x0, y, w, 1, T[1]);
        break;
      case 'tunic':
        buf.rect(x0, y, w, 1, L[2]);
        buf.set(x0, y, L[1]);
        buf.set(x0 + w - 1, y, L[3]);
        if (r < 2) buf.rect(cx - 1, y, 3, 1, K[2]); // neck
        if (belt) {
          buf.rect(x0, y, w, 1, T[1]);
          buf.set(cx, y, G[2]);
        }
        break;
      case 'coat':
        buf.rect(x0, y, w, 1, C[2]);
        buf.set(x0, y, C[1]);
        buf.set(x0 + w - 1, y, C[3]);
        // open front showing the shirt, with trim along the edge
        if (r >= 1 && r < z.torsoH - 1) {
          buf.set(cx + 1, y, style.id === 'vampire' ? PAL.fire[1] : S[3]);
          buf.set(cx + 2, y, style.trim ?? C[3]);
        }
        if (r < 2 && style.collar === 'fur') buf.rect(x0 - 1, y, w + 2, 1, r ? PAL.stone[3] : PAL.stone[4]);
        if (belt) {
          buf.rect(x0, y, w, 1, T[1]);
          buf.set(cx + 1, y, G[3]);
        }
        break;
      case 'dress':
        if (r < 4) {
          buf.rect(x0, y, w, 1, S[4]); // blouse
          buf.set(x0 + w - 1, y, PAL.white);
          buf.set(x0, y, S[3]);
        } else {
          buf.rect(x0, y, w, 1, C[2]);
          buf.set(x0, y, C[1]);
          buf.set(x0 + w - 1, y, C[3]);
        }
        if (r === 1) buf.set(cx + 1, y, T[2]); // neck bow
        if (belt) buf.rect(x0, y, w, 1, T[1]);
        break;
      case 'robe':
        buf.rect(x0, y, w, 1, R[2]);
        buf.set(x0, y, R[1]);
        buf.set(x0 + w - 1, y, R[3]);
        buf.set(cx + 1, y, r % 3 === 0 ? G[2] : R[1]); // trim down the front
        if (belt) buf.rect(x0, y, w, 1, T[1]);
        break;
    }
  }
  if (style.torso === 'plate') {
    buf.set(top[0] + 3, top[1] + 2, S[4]);
    buf.set(top[0] + 3, top[1] + 3, S[3]);
  }
  // Front panel over the thighs (tabard / loincloth)
  if (style.torso === 'plate' || style.torso === 'bare') {
    buf.rect(Math.round(hip[0]) - 1, Math.round(hip[1]) + 1, 4, 3, T[1]);
    buf.rect(Math.round(hip[0]) - 1, Math.round(hip[1]) + 3, 4, 1, T[0]);
    buf.set(Math.round(hip[0]) + 2, Math.round(hip[1]) + 1, T[2]);
  }

  // 4. Front leg
  {
    const [c, hi, border, bootC] = legColors(true);
    const knee = limb([hip[0] + 1, hip[1]], [ax + p.fFoot[0], ay + p.fFoot[1]], z.thigh, z.shin, -1, 4, c, hi, border);
    if (style.legs === 'plate') {
      buf.rect(Math.round(knee[0]), Math.round(knee[1]) - 1, 2, 2, S[3]);
      buf.set(Math.round(knee[0]) + 1, Math.round(knee[1]) - 1, S[4]);
    }
    boot([ax + p.fFoot[0], ay + p.fFoot[1]], bootC, style.legs === 'plate' ? L[2] : bootC);
  }

  // 4b. Short dress skirt (summoner)
  if (style.torso === 'dress') {
    for (let r = 0; r < 6; r++) {
      const w = z.torsoW + 2 + r;
      const x0 = Math.round(hip[0]) - Math.floor(w / 2);
      const y = Math.round(hip[1]) + r;
      buf.rect(x0, y, w, 1, C[2]);
      buf.set(x0, y, C[1]);
      buf.set(x0 + w - 1, y, C[3]);
      if (r === 5) buf.rect(x0, y, w, 1, PAL.white);
    }
  }

  // 4b. Robe skirt over the legs
  if (style.legs === 'robe') {
    const len = 8;
    for (let r = 0; r < len; r++) {
      const cx = Math.round(hip[0] + (p.fFoot[0] + p.bFoot[0]) * 0.25 * (r / len));
      const w = z.torsoW + Math.floor(r * 0.7);
      const x0 = cx - Math.floor(w / 2);
      const y = Math.round(hip[1]) + r;
      buf.rect(x0, y, w, 1, R[1]);
      buf.set(x0 + w - 1, y, R[2]);
      buf.set(x0, y, R[0]);
      if (r === len - 1) buf.rect(x0, y, w, 1, G[1]);
    }
  }

  // 5. Head
  const hx = Math.round(top[0] + p.head[0]);
  const hy = Math.round(top[1] + p.head[1]);
  switch (style.head) {
    case 'greathelm':
      buf.stamp(hx - 4, hy - 9, GREATHELM, { b: S[1], c: S[2], d: S[3], k: PAL.ink, g: G[2] });
      buf.set(hx + 2, hy - 8, S[4]);
      buf.stamp(hx - 7, hy - 12, PLUME, { T: T[1], t: T[2], u: T[3] });
      break;
    case 'horned':
      buf.stamp(hx - 6, hy - 10, HORNED, {
        h: S[4], H: S[3], c: S[2], d: S[3], s: K[2], S: K[3], k: PAL.ink, b: L[2],
      });
      buf.set(hx - 2, hy - 7, T[2]); // war paint in team color
      buf.set(hx - 1, hy - 7, T[2]);
      break;
    case 'hood':
      buf.stamp(hx - 5, hy - 9, HOOD, { T: T[1], t: T[2], u: T[3], D: T[0], s: K[2], k: PAL.ink });
      break;
    case 'hunter':
    case 'brawler':
    case 'vampire':
    case 'dhampir':
    case 'summoner': {
      const map = { hunter: HEAD_HUNTER, brawler: HEAD_BRAWLER, vampire: HEAD_VAMPIRE, dhampir: HEAD_DHAMPIR, summoner: HEAD_SUMMONER }[style.head];
      const beard = style.head === 'vampire' ? PAL.ink : style.head === 'hunter' ? Hr[0] : K[1];
      buf.stamp(hx - 4, hy - map.length + 1, map, {
        h: Hr[1], i: Hr[2], j: Hr[3], s: K[2], S: K[3], b: beard, k: style.eye ?? PAL.ink, T: T[1], t: T[2],
      });
      break;
    }
    case 'wizard': {
      // face + beard
      buf.rect(hx - 3, hy - 7, 7, 6, K[2]);
      buf.set(hx + 3, hy - 5, K[3]);
      buf.set(hx + 2, hy - 5, PAL.ink);
      buf.rect(hx - 3, hy - 3, 7, 3, S[4]);
      buf.rect(hx - 2, hy, 5, 3, S[4]);
      buf.rect(hx - 1, hy + 3, 3, 2, S[3]);
      buf.set(hx - 3, hy - 3, S[3]);
      // hat: brim, team band, cone bending back
      buf.rect(hx - 6, hy - 8, 13, 2, R[1]);
      buf.rect(hx - 6, hy - 8, 13, 1, R[2]);
      buf.rect(hx - 4, hy - 10, 9, 2, T[2]);
      buf.rect(hx - 4, hy - 10, 9, 1, T[3]);
      for (let i = 0; i < 11; i++) {
        const w = Math.max(1, 8 - Math.floor(i * 0.75));
        const bend = Math.round((i * i) / 18);
        const x0 = hx - Math.floor(w / 2) - bend;
        buf.rect(x0, hy - 11 - i, w, 1, R[2]);
        buf.set(x0 + w - 1, hy - 11 - i, R[3]);
        buf.set(x0, hy - 11 - i, R[1]);
      }
      break;
    }
  }

  // 6. Weapon
  if (hasWeapon) drawWeapon(buf, style, fHand, wd, perp, stringPt, drawAmt, p.whipOut);

  // 7. Front arm on top
  {
    const [c, hi, border, handC] = armColors(true);
    limb(fShoulder, fHand, z.upper, z.fore, 1, style.arms === 'robe' ? 4 : 3, c, hi, border);
    if (style.arms === 'plate') {
      buf.disc(fShoulder[0], fShoulder[1], 2, S[3]);
      buf.set(fShoulder[0], fShoulder[1] - 2, S[4]);
    } else if (style.arms === 'bare') {
      buf.disc(fShoulder[0], fShoulder[1], 2, L[1]); // fur pauldron
      buf.set(fShoulder[0] + 1, fShoulder[1] - 2, W[2]);
    }
    buf.rect(Math.round(fHand[0]) - 1, Math.round(fHand[1]) - 1, 3, 3, handC);
    buf.set(Math.round(fHand[0]), Math.round(fHand[1]) - 1, style.arms === 'plate' ? L[2] : K[3]);
  }

  buf.outline();
  return buf;
};

const drawWeapon = (
  buf: PixelBuffer,
  style: FighterStyle,
  h: V2,
  d: V2,
  perp: V2,
  stringPt: V2,
  draw: number,
  whipOut = false,
) => {
  const S = PAL.steel;
  const G = PAL.gold;
  const W = PAL.wood;
  const L = PAL.leather;
  const at = (t: number, o = 0): V2 => [h[0] + d[0] * t + perp[0] * o, h[1] + d[1] * t + perp[1] * o];
  switch (style.weapon) {
    case 'none':
      break;
    case 'whip':
    case 'chainwhip': {
      const chain = style.weapon === 'chainwhip';
      // handle
      buf.line(h[0] - d[0] * 2, h[1] - d[1] * 2, ...at(4), L[1], 2);
      buf.set(...at(4), chain ? S[3] : L[2]);
      if (whipOut) break;
      // coiled lash hanging from the hand
      for (let a = 0; a < Math.PI * 2; a += 0.3) {
        const x = h[0] - 1 + Math.cos(a) * 3;
        const y = h[1] + 5 + Math.sin(a) * 3.5;
        buf.set(x, y, chain ? (Math.floor(a * 3) % 2 ? S[3] : S[1]) : Math.floor(a * 3) % 2 ? L[2] : L[1]);
      }
      buf.line(...at(4), h[0] + 1, h[1] + 3, chain ? S[2] : L[2], 1);
      break;
    }
    case 'sword': {
      const [bx, by] = at(2);
      const [tx, ty] = at(19);
      buf.line(bx, by, tx, ty, S[3], 2);
      buf.line(bx - perp[0] * 0.6, by - perp[1] * 0.6, tx - perp[0] * 0.6, ty - perp[1] * 0.6, S[4], 1);
      buf.set(tx + d[0], ty + d[1], S[4]);
      buf.line(bx - perp[0] * 3, by - perp[1] * 3, bx + perp[0] * 3, by + perp[1] * 3, G[2], 1);
      buf.line(h[0], h[1], h[0] - d[0] * 2, h[1] - d[1] * 2, L[1], 2);
      buf.set(h[0] - d[0] * 3, h[1] - d[1] * 3, G[3]);
      break;
    }
    case 'axe': {
      const [ex, ey] = at(18);
      buf.line(h[0] - d[0] * 3, h[1] - d[1] * 3, ex, ey, W[2], 2);
      buf.line(h[0] - d[0] * 3, h[1] - d[1] * 3, ex, ey, W[1], 1);
      // crescent blade on the +perp side, small spike on the other
      for (let t = 11; t <= 18; t++) {
        const reach = 6 - Math.abs(t - 14.5) * 0.9;
        for (let o = 1; o <= reach; o += 0.5) {
          const [x, y] = at(t, o);
          buf.set(x, y, o > reach - 1 ? S[4] : S[2]);
        }
      }
      buf.line(...at(13, -1), ...at(15, -3), S[1], 1);
      buf.set(...at(18.5), S[3]);
      break;
    }
    case 'bow': {
      // limbs curve back toward the archer; grip at the hand
      let prev: V2 | null = null;
      for (let t = -10; t <= 10; t++) {
        const back = (t * t) / 26 + draw * (t * t) / 60;
        const pt: V2 = [h[0] + perp[0] * t - d[0] * back, h[1] + perp[1] * t - d[1] * back];
        if (prev) buf.line(prev[0], prev[1], pt[0], pt[1], Math.abs(t) < 3 ? L[1] : W[2], 2);
        prev = pt;
      }
      const tipA: V2 = [h[0] + perp[0] * -10 - d[0] * (100 / 26 + draw * 1.6), h[1] + perp[1] * -10 - d[1] * (100 / 26 + draw * 1.6)];
      const tipB: V2 = [h[0] + perp[0] * 10 - d[0] * (100 / 26 + draw * 1.6), h[1] + perp[1] * 10 - d[1] * (100 / 26 + draw * 1.6)];
      const sp = draw > 0 ? stringPt : ([(tipA[0] + tipB[0]) / 2, (tipA[1] + tipB[1]) / 2] as V2);
      buf.line(tipA[0], tipA[1], sp[0], sp[1], PAL.steel[4], 1);
      buf.line(sp[0], sp[1], tipB[0], tipB[1], PAL.steel[4], 1);
      if (draw > 0) {
        buf.line(sp[0], sp[1], h[0] + d[0] * 5, h[1] + d[1] * 5, W[3], 1);
        buf.set(h[0] + d[0] * 6, h[1] + d[1] * 6, S[4]);
      }
      break;
    }
    case 'staff': {
      const orb = style.orb ?? PAL.fire;
      const [bx, by] = at(-9);
      const [tx, ty] = at(13);
      buf.line(bx, by, tx, ty, W[1], 2);
      buf.line(bx, by, tx, ty, W[2], 1);
      const [ox, oy] = at(16);
      buf.disc(ox, oy, 3, orb[1]);
      buf.disc(ox, oy, 2, orb[2]);
      buf.set(ox + 1, oy - 1, orb[orb.length - 1]);
      buf.set(ox, oy - 1, orb[3]);
      // claws holding the orb
      buf.set(...at(14, 2), G[2]);
      buf.set(...at(14, -2), G[2]);
      break;
    }
  }
};

// ── Animation library ─────────────────────────────────────────────────────

const TUCK: Pose = { fFoot: [3, -6], bFoot: [-4, -4] };

/** Loops for each family, derived from the knight's so timing and silhouettes stay consistent. */
const withWeapon = (poses: KnightPose[], sword: number, fArm?: [number, number], extra: Pose = {}): Pose[] =>
  poses.map((p) => ({ ...p, sword, ...(fArm ? { fArm } : {}), ...extra }));

export const LOOPS: Record<FighterStyle['family'], Record<string, Pose[]>> = {
  melee: KNIGHT_LOOPS,
  bow: {
    ...KNIGHT_LOOPS,
    idle: withWeapon(KNIGHT_LOOPS.idle, 80, [50, 0.7]),
    run: KNIGHT_LOOPS.run.map((p) => ({ ...p, sword: 85, fArm: [60, 0.7] as [number, number] })),
    jump: withWeapon(KNIGHT_LOOPS.jump, -10, [0, 0.85]),
    fall: withWeapon(KNIGHT_LOOPS.fall, 20, [20, 0.8]),
    land: withWeapon(KNIGHT_LOOPS.land, 80, [55, 0.7]),
    dodge: withWeapon(KNIGHT_LOOPS.dodge, 70, [60, 0.6]),
  },
  staff: {
    ...KNIGHT_LOOPS,
    idle: KNIGHT_LOOPS.idle.map((p, i) => ({ ...p, sword: -82, fArm: [70, 0.55 + (i > 1 ? 0.02 : 0)] as [number, number] })),
    run: KNIGHT_LOOPS.run.map((p) => ({ ...p, sword: -45, fArm: [60, 0.6] as [number, number] })),
    jump: withWeapon(KNIGHT_LOOPS.jump, -80, [40, 0.6]),
    fall: withWeapon(KNIGHT_LOOPS.fall, -70, [50, 0.6]),
    land: withWeapon(KNIGHT_LOOPS.land, -80, [70, 0.55]),
    dodge: withWeapon(KNIGHT_LOOPS.dodge, -85, [60, 0.5]),
  },
};

const A = (startup: Pose[], active: Pose[], recovery: Pose[]): AttackAnim => ({ startup, active, recovery });

/** Shared attack animations (knight's own set is included). Weapon angle = `sword`. */
export const ATTACK_ANIMS: Record<string, AttackAnim> = {
  ...KNIGHT_ATTACKS,
  swing_h: A(
    [{ fArm: [-70, 0.7], sword: -130, lean: -1 }],
    [{ fArm: [0, 1], sword: 10, lean: 3, fFoot: [7, -2] }],
    [{ fArm: [35, 0.9], sword: 55, lean: 2 }],
  ),
  swing_h2: A(
    [{ fArm: [-80, 0.6], sword: -140, lean: -2, hip: [-1, -13] }],
    [{ fArm: [-5, 1], sword: -5, lean: 4, fFoot: [9, -2], bFoot: [-8, -2] }],
    [{ fArm: [25, 1], sword: 30, lean: 3, fFoot: [9, -2] }],
  ),
  swing_up: KNIGHT_ATTACKS.up_light,
  overhead: KNIGHT_ATTACKS.heavy,
  spin: A(
    [{ hip: [0, -11], fArm: [150, 0.8], sword: 170, lean: -2 }],
    [
      { hip: [0, -12], fArm: [0, 1], sword: 0, lean: 1 },
      { hip: [0, -12], fArm: [180, 1], sword: 180, lean: -1 },
    ],
    [{ fArm: [40, 0.8], sword: 60 }],
  ),
  throw: A(
    [{ fArm: [-140, 0.9], sword: -150, lean: -3, fFoot: [6, -2] }],
    [{ fArm: [10, 1], sword: 10, lean: 4, fFoot: [9, -2], noWeapon: true }],
    [{ fArm: [40, 0.8], sword: 40, lean: 2, noWeapon: true }],
  ),
  leap: A(
    [{ hip: [0, -9], fArm: [70, 0.8], sword: 80, fFoot: [5, -2], bFoot: [-6, -2] }],
    [{ hip: [0, -14], fArm: [-90, 1], sword: -90, bArm: [-100, 0.8], ...TUCK }],
    [{ fArm: [-70, 0.9], sword: -60, fFoot: [3, -5], bFoot: [-3, -3] }],
  ),
  air_swing: KNIGHT_ATTACKS.air_light,
  punch: A(
    [{ fArm: [160, 0.5], lean: -1, noWeapon: true }],
    [{ fArm: [0, 1], lean: 3, fFoot: [6, -2], noWeapon: true }],
    [{ fArm: [20, 0.7], lean: 1, noWeapon: true }],
  ),
  punch_heavy: A(
    [{ fArm: [170, 0.6], bArm: [60, 0.8], lean: -3, hip: [-1, -12], noWeapon: true }],
    [{ fArm: [-5, 1], lean: 5, hip: [2, -12], fFoot: [9, -2], noWeapon: true }],
    [{ fArm: [20, 0.8], lean: 3, noWeapon: true }],
  ),
  bash: A(
    [{ fArm: [110, 0.5], lean: -1, hip: [-1, -12], noWeapon: true }],
    [{ fArm: [100, 0.5], bArm: [80, 0.5], lean: 5, hip: [2, -12], fFoot: [8, -2], noWeapon: true }],
    [{ fArm: [80, 0.6], lean: 2, noWeapon: true }],
  ),
  uppercut: A(
    [{ hip: [0, -10], fArm: [90, 0.6], noWeapon: true }],
    [{ hip: [0, -15], fArm: [-80, 1], lean: 1, noWeapon: true }],
    [{ fArm: [-60, 0.8], noWeapon: true }],
  ),
  stomp: A(
    [{ fFoot: [5, -10], fArm: [-40, 0.7], bArm: [-140, 0.7], noWeapon: true }],
    [{ hip: [0, -11], fFoot: [6, -2], fArm: [60, 0.8], bArm: [120, 0.8], noWeapon: true }],
    [{ hip: [0, -12], noWeapon: true }],
  ),
  air_kick: A(
    [{ ...TUCK, fArm: [60, 0.6], noWeapon: true }],
    [{ fFoot: [12, -14], bFoot: [-4, -5], lean: -2, fArm: [120, 0.6], noWeapon: true }],
    [{ ...TUCK, noWeapon: true }],
  ),
  air_stomp: A(
    [{ fFoot: [4, -10], bFoot: [-4, -8], fArm: [-60, 0.7], bArm: [-120, 0.7], noWeapon: true }],
    [{ fFoot: [2, 2], bFoot: [-3, -4], fArm: [-30, 0.8], bArm: [-150, 0.8], noWeapon: true }],
    [{ ...TUCK, noWeapon: true }],
  ),
  kick: A(
    [{ fFoot: [3, -6], lean: -1, fArm: [60, 0.7], sword: 80 }],
    [{ fFoot: [14, -16], lean: -3, bFoot: [-5, -2], fArm: [120, 0.6], sword: 100 }],
    [{ fFoot: [6, -4], fArm: [60, 0.7], sword: 80 }],
  ),
  sweep_kick: A(
    [{ hip: [0, -9], fFoot: [4, -2], bFoot: [-8, -2], fArm: [80, 0.6], sword: 90 }],
    [{ hip: [0, -7], fFoot: [15, -2], bFoot: [-9, -2], lean: -2, fArm: [120, 0.7], sword: 100 }],
    [{ hip: [0, -9], fFoot: [8, -2], fArm: [80, 0.6], sword: 90 }],
  ),
  bow_forward: A(
    [{ fArm: [0, 1], sword: 0, draw: 0.5, lean: 0 }],
    [{ fArm: [0, 1], sword: 0, draw: 1, lean: -1 }],
    [{ fArm: [0, 1], sword: 0, draw: 0, bArm: [170, 0.5], lean: 0 }],
  ),
  bow_up: A(
    [{ fArm: [-70, 1], sword: -75, draw: 0.5, lean: -1 }],
    [{ fArm: [-70, 1], sword: -75, draw: 1, lean: -2 }],
    [{ fArm: [-70, 1], sword: -75, draw: 0, bArm: [150, 0.5] }],
  ),
  bow_down: A(
    [{ fArm: [50, 1], sword: 50, draw: 0.5, ...TUCK }],
    [{ fArm: [50, 1], sword: 50, draw: 1, ...TUCK }],
    [{ fArm: [50, 1], sword: 50, draw: 0, ...TUCK }],
  ),
  bow_charge: A(
    [
      { fArm: [0, 1], sword: 0, draw: 0.6, lean: -1, fFoot: [6, -2], bFoot: [-7, -2] },
      { fArm: [0, 1], sword: 0, draw: 1, lean: -2, fFoot: [6, -2], bFoot: [-7, -2] },
    ],
    [{ fArm: [0, 1], sword: 0, draw: 0, bArm: [180, 0.6], lean: 1, fFoot: [6, -2], bFoot: [-7, -2] }],
    [{ fArm: [10, 0.9], sword: 20, lean: 0 }],
  ),
  staff_jab: A(
    [{ fArm: [80, 0.5], sword: 10, lean: -1 }],
    [{ fArm: [0, 1], sword: 0, lean: 3, fFoot: [7, -2] }],
    [{ fArm: [30, 0.8], sword: -30, lean: 1 }],
  ),
  staff_low: A(
    [{ hip: [0, -10], fArm: [20, 0.6], sword: -20 }],
    [{ hip: [0, -9], fArm: [45, 1], sword: 20, lean: 3, fFoot: [8, -2], bFoot: [-8, -2] }],
    [{ hip: [0, -10], fArm: [50, 0.9], sword: 30, lean: 2 }],
  ),
  cast_forward: A(
    [{ fArm: [-60, 0.7], sword: -100, bArm: [-120, 0.6], lean: -1 }],
    [{ fArm: [0, 1], sword: -20, bArm: [30, 0.9], lean: 3, fFoot: [7, -2] }],
    [{ fArm: [20, 0.8], sword: -40, lean: 1 }],
  ),
  cast_up: A(
    [{ hip: [0, -11], fArm: [40, 0.8], sword: -40 }],
    [{ hip: [0, -14], fArm: [-85, 1], sword: -90, bArm: [-100, 0.8] }],
    [{ fArm: [-60, 0.8], sword: -80 }],
  ),
  cast_burst: A(
    [{ hip: [0, -11], fArm: [-40, 0.6], sword: -80, bArm: [-140, 0.6] }],
    [{ hip: [0, -12], fArm: [40, 1], sword: 50, bArm: [140, 1], lean: 0 }],
    [{ hip: [0, -12], fArm: [60, 0.8], sword: 20, bArm: [120, 0.8] }],
  ),
  cast_ground: A(
    [{ fArm: [-100, 0.8], sword: -100, bArm: [-110, 0.7], lean: -1, hip: [0, -14] }],
    [{ fArm: [60, 1], sword: 75, bArm: [60, 0.8], lean: 3, hip: [0, -11], fFoot: [7, -2] }],
    [{ fArm: [60, 0.9], sword: 70, lean: 2, hip: [0, -12] }],
  ),
  cast_charge: A(
    [
      { fArm: [-30, 0.7], sword: -85, bArm: [0, 0.6], lean: -1 },
      { fArm: [-20, 0.75], sword: -80, bArm: [-10, 0.7], lean: -2 },
    ],
    [{ fArm: [0, 1], sword: -10, bArm: [10, 1], lean: 4, fFoot: [8, -2], bFoot: [-8, -2] }],
    [{ fArm: [15, 0.9], sword: -30, lean: 2 }],
  ),
  air_cast: A(
    [{ fArm: [-60, 0.7], sword: -100, ...TUCK }],
    [{ fArm: [0, 1], sword: -20, bArm: [30, 0.9], ...TUCK }],
    [{ fArm: [20, 0.8], sword: -40, ...TUCK }],
  ),
  // ── Temporada 1 ──
  whip_lash: A(
    [{ fArm: [-120, 0.8], sword: -150, lean: -2, whipOut: true }],
    [{ fArm: [0, 1], sword: 0, lean: 3, fFoot: [7, -2], whipOut: true }],
    [{ fArm: [20, 0.9], sword: 20, lean: 1, whipOut: true }],
  ),
  whip_up: A(
    [{ fArm: [100, 0.7], sword: 120, lean: -1, whipOut: true }],
    [{ fArm: [-45, 1], sword: -45, lean: 1, whipOut: true }],
    [{ fArm: [-30, 0.9], sword: -30, whipOut: true }],
  ),
  whip_low: A(
    [{ hip: [0, -10], fArm: [-100, 0.7], sword: -120, fFoot: [6, -2], bFoot: [-7, -2], whipOut: true }],
    [{ hip: [0, -8], fArm: [20, 1], sword: 20, lean: 3, fFoot: [9, -2], bFoot: [-9, -2], whipOut: true }],
    [{ hip: [0, -9], fArm: [40, 0.9], sword: 40, fFoot: [8, -2], bFoot: [-8, -2], whipOut: true }],
  ),
  whip_heavy: A(
    [
      { fArm: [-140, 0.9], sword: -160, lean: -2, hip: [-1, -13], whipOut: true },
      { fArm: [-160, 0.95], sword: -175, lean: -3, hip: [-1, -13], fFoot: [6, -2], bFoot: [-7, -2], whipOut: true },
    ],
    [{ fArm: [-5, 1], sword: -5, lean: 4, hip: [2, -12], fFoot: [9, -2], bFoot: [-8, -2], whipOut: true }],
    [{ fArm: [20, 0.9], sword: 25, lean: 2, fFoot: [8, -2], whipOut: true }],
  ),
  whip_spin: A(
    [{ fArm: [-90, 0.9], sword: -90, hip: [0, -12], whipOut: true }],
    [
      { fArm: [-60, 1], sword: -60, hip: [0, -12], whipOut: true },
      { fArm: [-120, 1], sword: -120, hip: [0, -12], lean: -1, whipOut: true },
    ],
    [{ fArm: [30, 0.8], sword: 40, whipOut: true }],
  ),
  air_whip: A(
    [{ ...TUCK, fArm: [-120, 0.8], sword: -150, whipOut: true }],
    [{ ...TUCK, fArm: [0, 1], sword: 0, lean: 2, whipOut: true }],
    [{ ...TUCK, fArm: [20, 0.9], sword: 20, whipOut: true }],
  ),
  air_whip_up: A(
    [{ ...TUCK, fArm: [60, 0.8], sword: 80, whipOut: true }],
    [{ ...TUCK, fArm: [-75, 1], sword: -80, whipOut: true }],
    [{ ...TUCK, fArm: [-50, 0.9], sword: -50, whipOut: true }],
  ),
  air_whip_down: A(
    [{ ...TUCK, fArm: [-100, 0.8], sword: -120, whipOut: true }],
    [{ ...TUCK, fArm: [45, 1], sword: 45, lean: 2, whipOut: true }],
    [{ ...TUCK, fArm: [60, 0.9], sword: 60, whipOut: true }],
  ),
  toss: A(
    [{ bArm: [-150, 0.9], fArm: [60, 0.7], lean: -2, fFoot: [6, -2] }],
    [{ bArm: [0, 1], fArm: [70, 0.6], lean: 3, fFoot: [8, -2], bFoot: [-7, -2] }],
    [{ bArm: [30, 0.8], fArm: [50, 0.7], lean: 1 }],
  ),
  cape_swipe: A(
    [{ fArm: [-110, 0.8], bArm: [-60, 0.7], lean: -2 }],
    [{ fArm: [10, 1], bArm: [60, 0.9], lean: 4, fFoot: [8, -2] }],
    [{ fArm: [30, 0.9], bArm: [80, 0.8], lean: 2 }],
  ),
  cape_open: A(
    [{ fArm: [-30, 0.8], bArm: [-130, 0.8], hip: [0, -12] }],
    [{ fArm: [-20, 1], bArm: [-160, 1], lean: -1, hip: [0, -15] }],
    [{ fArm: [0, 0.9], bArm: [-120, 0.9], hip: [0, -13] }],
  ),
  claw_low: A(
    [{ hip: [0, -10], fArm: [-40, 0.7], lean: -1 }],
    [{ hip: [0, -8], fArm: [50, 1], lean: 4, fFoot: [9, -2], bFoot: [-9, -2] }],
    [{ hip: [0, -9], fArm: [60, 0.9], lean: 2 }],
  ),
  phantom_step: A(
    [{ hip: [0, -10], lean: 4, fArm: [150, 0.8], sword: 160, fFoot: [6, -2], bFoot: [-8, -2] }],
    [{ fArm: [0, 1], sword: 5, lean: 4, fFoot: [9, -2], bFoot: [-8, -2] }],
    [{ fArm: [30, 0.9], sword: 45, lean: 2 }],
  ),
  phantom_rise: A(
    [{ hip: [0, -10], fArm: [70, 0.8], sword: 80 }],
    [{ hip: [0, -14], fArm: [-90, 1], sword: -90, bArm: [-100, 0.8], ...TUCK }],
    [{ fArm: [-60, 0.9], sword: -60, ...TUCK }],
  ),
  air_cast_up: A(
    [{ fArm: [40, 0.8], sword: -40, ...TUCK }],
    [{ fArm: [-85, 1], sword: -90, bArm: [-100, 0.8], ...TUCK }],
    [{ fArm: [-60, 0.8], sword: -80, ...TUCK }],
  ),
};

/** Anim ids a character actually needs: loops + its attacks' anims. */
export const framesForCharacter = (
  style: FighterStyle,
  attackAnims: string[],
): { name: string; pose: Pose }[] => {
  const out: { name: string; pose: Pose }[] = [];
  const loops = LOOPS[style.family];
  for (const [anim, poses] of Object.entries(loops)) poses.forEach((pose, i) => out.push({ name: `${anim}_${i}`, pose }));
  for (const anim of new Set(attackAnims)) {
    const a = ATTACK_ANIMS[anim];
    if (!a) continue;
    (['startup', 'active', 'recovery'] as const).forEach((phase) =>
      a[phase].forEach((pose, i) => out.push({ name: `${anim}_${phase}_${i}`, pose })),
    );
  }
  if (style.throwable) {
    for (const f of [...out]) out.push({ name: `u_${f.name}`, pose: { ...f.pose, noWeapon: true } });
  }
  return out;
};
