import Phaser from 'phaser';
import { PixelBuffer } from './pixelBuffer';
import { INK, PAL, TEAM_RAMPS, TEAM_ORDER, type TeamColor } from './palette';
import { CHARACTERS, CHARACTER_ORDER } from '@magiclash/shared';
import { CELL, STYLES, drawFighter, framesForCharacter } from './fighterSprite';
import {
  arrowFrames,
  axeFrames,
  beamFrames,
  burstRingFrames,
  crystalFrames,
  explosionFrames,
  fireColumnFrames,
  frostFrames,
  iceSpikesFrames,
  orbFrames,
  shockFrames,
  sparkBoltFrames,
} from './projectileSprites';
import {
  SLASHES,
  dustFrames,
  flameFrames,
  impactFrames,
  smokeFrames,
  ringFrames,
  slashFrames,
  sparkFrames,
  streakFrames,
  type EffectSheet,
} from './effectSprites';
import {
  HELL,
  batFrames,
  bloodHitFrames,
  catFrames,
  crescentFrames,
  daggerFrames,
  doveFrames,
  dragonFrames,
  featherFrames,
  mistFrames,
  phoenixFrames,
  pillarFrames,
  runeDiscFrames,
  turtleFrames,
} from './season1Sprites';
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

/** Rows to skip above the face when cropping portraits (tall hats). */
const PORTRAIT_SKIP: Record<string, number> = { fire_mage: 8, ice_mage: 8, lightning_mage: 8, barbarian: 1, vampire: 1 };

const registerTeamUi = (scene: Phaser.Scene, team: TeamColor) => {
  const T = TEAM_RAMPS[team];
  const icon = new PixelBuffer(7, 8);
  icon.stamp(0, 0, STOCK_ICON, { k: INK, T: T[2], u: PAL.gold[3] });
  addBuffer(scene, `stock_${team}`, icon);

  for (const id of CHARACTER_ORDER) {
    const idle = drawFighter({}, STYLES[id], team);
    let top = 0;
    while (top < CELL && ![...Array(CELL).keys()].some((x) => idle.alphaAt(x, top) > 0)) top++;
    top += PORTRAIT_SKIP[id] ?? 0;
    const portrait = new PixelBuffer(18, 18);
    for (let y = 0; y < 18; y++) {
      for (let x = 0; x < 18; x++) {
        const a = idle.alphaAt(x + 23, y + top);
        if (a) portrait.set(x, y, idle.colorAt(x + 23, y + top));
      }
    }
    addBuffer(scene, `portrait_${id}_${team}`, portrait);
  }
};

export const fighterTextureKey = (characterId: string, team: TeamColor) => `fighter_${characterId}_${team}`;

/**
 * Fighter sheets are generated lazily, only for the character/color pairs actually on
 * screen (6 classes × 4 colors up-front would waste GPU memory).
 */
export const ensureFighterTexture = (scene: Phaser.Scene, characterId: string, team: TeamColor): string => {
  const key = fighterTextureKey(characterId, team);
  if (scene.textures.exists(key)) return key;
  const style = STYLES[characterId];
  const frames = framesForCharacter(style, CHARACTERS[characterId].attacks.map((a) => a.anim));
  addSheet(
    scene,
    key,
    frames.map((f) => drawFighter(f.pose, style, team)),
    frames.map((f) => f.name),
  );
  return key;
};

export const registerAllTextures = (scene: Phaser.Scene): void => {
  registerFonts(scene);

  for (const team of TEAM_ORDER) registerTeamUi(scene, team);

  for (const [id, def] of Object.entries(SLASHES)) addEffect(scene, `fx_${id}`, slashFrames(def));
  addEffect(scene, 'fx_thrust', streakFrames(false, 40));
  addEffect(scene, 'fx_thrust_down', streakFrames(true, 30));
  addEffect(scene, 'fx_plunge', streakFrames(true, 44));
  addEffect(scene, 'fx_spark', sparkFrames(false));
  addEffect(scene, 'fx_spark_big', sparkFrames(true));
  addEffect(scene, 'fx_dust', dustFrames());
  addEffect(scene, 'fx_ring', ringFrames());
  addEffect(scene, 'fx_flame', flameFrames());
  addEffect(scene, 'fx_explosion', explosionFrames(40));
  addEffect(scene, 'fx_explosion_big', explosionFrames(58));
  addEffect(scene, 'fx_explosion_huge', explosionFrames(80));
  addEffect(scene, 'fx_burst', burstRingFrames(56));
  addEffect(scene, 'fx_shock', shockFrames());
  addEffect(scene, 'fx_frost', frostFrames());

  // Projectiles (key = proj_<sprite>)
  addEffect(scene, 'proj_arrow', arrowFrames(false));
  addEffect(scene, 'proj_arrow_heavy', arrowFrames(true));
  addEffect(scene, 'proj_axe', axeFrames());
  addEffect(scene, 'proj_fireball', orbFrames(14, PAL.fire));
  addEffect(scene, 'proj_great_fireball', orbFrames(20, PAL.fire));
  addEffect(scene, 'proj_fire_column', fireColumnFrames(24, 72));
  addEffect(scene, 'proj_ice_shard', crystalFrames(14, 7));
  addEffect(scene, 'proj_ice_lance', crystalFrames(22, 8));
  addEffect(scene, 'proj_ice_spikes', iceSpikesFrames(42, 28));
  addEffect(scene, 'proj_spark_bolt', sparkBoltFrames());
  addEffect(scene, 'proj_thunder_beam', beamFrames(112, 12, false));
  addEffect(scene, 'proj_sky_spark', beamFrames(62, 16, true));
  addEffect(scene, 'proj_ball_lightning', orbFrames(16, PAL.lightning, true));
  addEffect(scene, 'proj_thunderstrike', beamFrames(130, 20, true));

  addEffect(scene, 'fx_impact', impactFrames(40));
  addEffect(scene, 'fx_impact_big', impactFrames(64));
  addEffect(scene, 'fx_shockwave', burstRingFrames(110));
  addEffect(scene, 'fx_smoke', smokeFrames());

  // ── Temporada 1 ──
  addEffect(scene, 'fx_mist', mistFrames());
  addEffect(scene, 'fx_bat', batFrames());
  addEffect(scene, 'fx_feather', featherFrames());
  addEffect(scene, 'fx_blood', bloodHitFrames());
  addEffect(scene, 'proj_dagger', daggerFrames());
  addEffect(scene, 'proj_azure_flame', orbFrames(12, PAL.ice, true));
  addEffect(scene, 'proj_azure_orb', orbFrames(24, PAL.ice, true));
  addEffect(scene, 'proj_rune_disc', runeDiscFrames());
  addEffect(scene, 'proj_azure_pillar', pillarFrames(24, 70, PAL.ice));
  addEffect(scene, 'proj_hellflame', orbFrames(14, HELL, true));
  addEffect(scene, 'proj_inferno_orb', orbFrames(34, HELL, true));
  addEffect(scene, 'proj_hell_geyser', pillarFrames(30, 80, HELL));
  addEffect(scene, 'proj_crimson_wave', crescentFrames(18, 26));
  addEffect(scene, 'proj_dove', doveFrames());
  addEffect(scene, 'proj_cat', catFrames());
  addEffect(scene, 'proj_phoenix', phoenixFrames());
  addEffect(scene, 'proj_dragon', dragonFrames());
  addEffect(scene, 'proj_turtle', turtleFrames());

  const px = new PixelBuffer(1, 1);
  px.set(0, 0, PAL.white);
  addBuffer(scene, 'px', px);

  const shadow = new PixelBuffer(16, 3);
  shadow.rect(2, 0, 12, 3, INK);
  shadow.rect(0, 1, 16, 1, INK);
  addBuffer(scene, 'shadow', shadow);
};

export const FIGHTER_CELL = CELL;
