import Phaser from 'phaser';
import { PixelBuffer } from './pixelBuffer';
import { INK, PAL, TEAM_RAMPS, TEAM_ORDER, type TeamColor } from './palette';
import { CELL, drawKnight, knightFrameList } from './knightSprite';
import {
  SLASHES,
  dustFrames,
  flameFrames,
  ringFrames,
  slashFrames,
  sparkFrames,
  streakFrames,
  type EffectSheet,
} from './effectSprites';
import { FONT_CHARS, GLYPH_H, GLYPH_W, glyphRows } from '../../ui/pixelFont';

/**
 * Generates every placeholder texture at boot (≈ tens of ms). Frame names are the contract
 * with final art: replacing a texture with an atlas using the same names needs no code change.
 */

export const EFFECT_ORIGINS = new Map<string, { x: number; y: number; frames: number }>();

const addBuffer = (scene: Phaser.Scene, key: string, buf: PixelBuffer) => {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, buf.w, buf.h)!;
  buf.putOn(tex.getContext(), 0, 0);
  tex.refresh();
  return tex;
};

const addSheet = (scene: Phaser.Scene, key: string, frames: PixelBuffer[], names?: string[]) => {
  const w = frames[0].w;
  const h = frames[0].h;
  const cols = Math.min(frames.length, 16);
  const rows = Math.ceil(frames.length / cols);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, cols * w, rows * h)!;
  const ctx = tex.getContext();
  frames.forEach((f, i) => {
    const x = (i % cols) * w;
    const y = Math.floor(i / cols) * h;
    f.putOn(ctx, x, y);
    tex.add(names?.[i] ?? i, 0, x, y, w, h);
  });
  tex.refresh();
};

const addEffect = (scene: Phaser.Scene, key: string, sheet: EffectSheet) => {
  addSheet(scene, key, sheet.frames);
  EFFECT_ORIGINS.set(key, { x: sheet.originX, y: sheet.originY, frames: sheet.frames.length });
};

// ── Font ────────────────────────────────────────────────────────────────────

export const FONT = 'px';
export const FONT_OUTLINE = 'pxo';
export const FONT_LINE = GLYPH_H + 2;

const registerFonts = (scene: Phaser.Scene) => {
  const chars = [...FONT_CHARS];
  const perRow = 32;
  const variants = [
    { key: FONT, cw: GLYPH_W + 1, ch: GLYPH_H, pad: 0 },
    { key: FONT_OUTLINE, cw: GLYPH_W + 2, ch: GLYPH_H + 2, pad: 1 },
  ];
  for (const v of variants) {
    const rows = Math.ceil(chars.length / perRow);
    const buf = new PixelBuffer(perRow * v.cw, rows * v.ch);
    chars.forEach((c, i) => {
      const gx = (i % perRow) * v.cw + v.pad;
      const gy = Math.floor(i / perRow) * v.ch + v.pad;
      const glyph = new PixelBuffer(v.cw, v.ch);
      glyph.stamp(v.pad, v.pad, glyphRows(c), { '#': PAL.white });
      if (v.pad) glyph.outline(INK);
      buf.blit(glyph, gx - v.pad, gy - v.pad);
    });
    addBuffer(scene, `${v.key}_img`, buf);
    const data = Phaser.GameObjects.RetroFont.Parse(scene, {
      image: `${v.key}_img`,
      width: v.cw,
      height: v.ch,
      chars: chars.join(''),
      charsPerRow: perRow,
      'spacing.x': 0,
      'spacing.y': 0,
      'offset.x': 0,
      'offset.y': 0,
      lineSpacing: 2,
    });
    scene.cache.bitmapFont.add(v.key, data);
  }
};

// ── UI pieces ─────────────────────────────────────────────────────────────────

export const drawPanel = (w: number, h: number, accent: number = PAL.gold[2]): PixelBuffer => {
  const b = new PixelBuffer(w, h);
  const S = PAL.stone;
  b.rect(0, 0, w, h, INK);
  b.rect(1, 1, w - 2, h - 2, S[3]);
  b.rect(2, 2, w - 3, h - 3, S[1]);
  b.rect(2, 2, w - 4, h - 4, S[2]);
  b.rect(3, 3, w - 6, h - 6, PAL.sky[0]);
  // stepped corners
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) b.clear(x, y);
  // rivets
  for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) b.set(x, y, accent);
  return b;
};

export const ensurePanel = (scene: Phaser.Scene, w: number, h: number, accent?: number): string => {
  const key = `panel_${w}x${h}_${accent ?? 'g'}`;
  if (!scene.textures.exists(key)) addBuffer(scene, key, drawPanel(w, h, accent));
  return key;
};

const STOCK_ICON = ['kkkkkkk', 'kTTuTTk', 'kTTuTTk', 'kTuuuTk', 'kTTuTTk', '.kTTTk.', '..kTk..', '...k...'];

const registerTeamUi = (scene: Phaser.Scene, team: TeamColor) => {
  const T = TEAM_RAMPS[team];
  const icon = new PixelBuffer(7, 8);
  icon.stamp(0, 0, STOCK_ICON, { k: INK, T: T[2], u: PAL.gold[3] });
  addBuffer(scene, `stock_${team}`, icon);

  const idle = drawKnight({}, team);
  const portrait = new PixelBuffer(18, 18);
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 18; x++) {
      const a = idle.alphaAt(x + 22, y + 17);
      if (a) portrait.set(x, y, idle.colorAt(x + 22, y + 17));
    }
  }
  addBuffer(scene, `portrait_${team}`, portrait);
};

export const registerAllTextures = (scene: Phaser.Scene): void => {
  registerFonts(scene);

  const frames = knightFrameList();
  for (const team of TEAM_ORDER) {
    addSheet(
      scene,
      `knight_${team}`,
      frames.map((f) => drawKnight(f.pose, team)),
      frames.map((f) => f.name),
    );
    registerTeamUi(scene, team);
  }

  for (const [id, def] of Object.entries(SLASHES)) addEffect(scene, `fx_${id}`, slashFrames(def));
  addEffect(scene, 'fx_thrust', streakFrames(false, 40));
  addEffect(scene, 'fx_thrust_down', streakFrames(true, 30));
  addEffect(scene, 'fx_plunge', streakFrames(true, 44));
  addEffect(scene, 'fx_spark', sparkFrames(false));
  addEffect(scene, 'fx_spark_big', sparkFrames(true));
  addEffect(scene, 'fx_dust', dustFrames());
  addEffect(scene, 'fx_ring', ringFrames());
  addEffect(scene, 'fx_flame', flameFrames());

  const px = new PixelBuffer(1, 1);
  px.set(0, 0, PAL.white);
  addBuffer(scene, 'px', px);

  const shadow = new PixelBuffer(16, 3);
  shadow.rect(2, 0, 12, 3, INK);
  shadow.rect(0, 1, 16, 1, INK);
  addBuffer(scene, 'shadow', shadow);
};

export const FIGHTER_CELL = CELL;
