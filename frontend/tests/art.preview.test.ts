import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/game/render/pixelBuffer';
import { CELL, drawKnight, knightFrameList } from '../src/game/render/knightSprite';
import { encodePng, upscale } from './png';

/**
 * Opt-in visual preview of procedural art: ART_PREVIEW_DIR=path npx vitest run frontend/tests/art.preview.test.ts
 * Writes PNG sheets so the art can be reviewed (curation step of the asset pipeline).
 */
const DIR = process.env.ART_PREVIEW_DIR ?? '';

const save = (name: string, buf: PixelBuffer, scale: number) => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, name), encodePng(buf.w * scale, buf.h * scale, upscale(buf.w, buf.h, buf.data, scale)));
};

it.skipIf(!DIR)('knight sheet', () => {
  const frames = knightFrameList();
  const cols = 8;
  const rows = Math.ceil(frames.length / cols) * 2;
  const sheet = new PixelBuffer(cols * CELL, rows * CELL);
  sheet.rect(0, 0, sheet.w, sheet.h, 0x5b5668);
  (['blue', 'red'] as const).forEach((team, t) => {
    frames.forEach((f, i) => {
      const x = (i % cols) * CELL;
      const y = (Math.floor(i / cols) + t * (rows / 2)) * CELL;
      sheet.rect(x, y + 56, CELL, 1, 0x7b7588); // ground line at the anchor
      sheet.blit(drawKnight(f.pose, team), x, y);
    });
  });
  save('knight_sheet.png', sheet, 3);
});

it.skipIf(!DIR)('knight detail', () => {
  const pick = ['idle_0', 'run_2', 'jab3_active_0', 'heavy_startup_1', 'lunge_active_0', 'hitstun_0'];
  const frames = knightFrameList().filter((f) => pick.includes(f.name));
  const sheet = new PixelBuffer(frames.length * 48, 48);
  sheet.rect(0, 0, sheet.w, sheet.h, 0x5b5668);
  frames.forEach((f, i) => {
    const k = drawKnight(f.pose, 'blue');
    const crop = new PixelBuffer(48, 48);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const a = k.alphaAt(x + 8, y + 12);
      if (a) crop.set(x, y, k.colorAt(x + 8, y + 12));
    }
    sheet.blit(crop, i * 48, 0);
  });
  save('knight_detail.png', sheet, 6);
});

it.skipIf(!DIR)('castle courtyard composed view', async () => {
  const { buildCastleCourtyardArt, parallaxPosition, REF_CENTER } = await import('../src/game/maps/castleCourtyardArt');
  const art = buildCastleCourtyardArt();
  const view = new PixelBuffer(640, 360);
  const scrollX = REF_CENTER.x - 320;
  const scrollY = REF_CENTER.y - 180;
  const [sky, mountains, castle, wall, front] = art.parallax;
  for (const l of [sky, mountains, castle, wall]) {
    const p = parallaxPosition(l);
    view.blit(l.buf, Math.round(p.x - scrollX * l.sf), Math.round(p.y - scrollY * l.sf));
  }
  view.blit(art.world.buf, art.world.x - scrollX, art.world.y - scrollY);
  const k1 = drawKnight({}, 'blue');
  view.blit(k1, -96 - 32 - scrollX, 0 - 56 - scrollY);
  const k2 = drawKnight({ fArm: [0, 1], sword: 5, lean: 2, fFoot: [6, -2] }, 'red');
  // mirror for facing left
  const k2m = new PixelBuffer(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (k2.alphaAt(x, y)) k2m.set(63 - x, y, k2.colorAt(x, y));
  view.blit(k2m, 96 - 31 - scrollX, 0 - 56 - scrollY);
  const k3 = drawKnight({ hip: [0, -14], fFoot: [3, -6], bFoot: [-4, -3], fArm: [10, 0.8], bArm: [-150, 0.7], sword: -70 }, 'blue');
  view.blit(k3, 92 - 32 - scrollX, -76 - 56 - scrollY);
  const pf = parallaxPosition(front);
  view.blit(front.buf, Math.round(pf.x - scrollX * front.sf), Math.round(pf.y - scrollY * front.sf));
  save('castle_courtyard.png', view, 2);
});

it.skipIf(!DIR)('all fighters', async () => {
  const { drawFighter, STYLES, framesForCharacter } = await import('../src/game/render/fighterSprite');
  const { CHARACTERS, CHARACTER_ORDER } = await import('@magiclash/shared');
  const pick = ['idle_0', 'run_2', 'jump_0'];
  const rows = CHARACTER_ORDER.map((id) => {
    const anims = CHARACTERS[id].attacks.map((a) => a.anim);
    const frames = framesForCharacter(STYLES[id], anims).filter((f) => !f.name.startsWith('u_'));
    const chosen = [...frames.filter((f) => pick.includes(f.name)), ...frames.filter((f) => f.name.includes('_active_0')).slice(0, 7)];
    return { id, chosen };
  });
  const cols = 10;
  const sheet = new PixelBuffer(cols * 48, rows.length * 48);
  sheet.rect(0, 0, sheet.w, sheet.h, 0x5b5668);
  const teams = ['blue', 'red', 'green', 'yellow', 'blue', 'red'] as const;
  rows.forEach((r, ri) => {
    r.chosen.slice(0, cols).forEach((f, i) => {
      const k = drawFighter(f.pose, STYLES[r.id], teams[ri]);
      const crop = new PixelBuffer(48, 48);
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (k.alphaAt(x + 8, y + 12)) crop.set(x, y, k.colorAt(x + 8, y + 12));
      sheet.blit(crop, i * 48, ri * 48);
    });
  });
  save('fighters.png', sheet, 3);
});

it.skipIf(!DIR)('every stage at the reference view', async () => {
  const { parallaxPosition, REF_CENTER } = await import('../src/game/maps/castleCourtyardArt');
  const { STAGE_ORDER, STAGES } = await import('@magiclash/shared');
  const builders = {
    castle_courtyard: (await import('../src/game/maps/castleCourtyardArt')).buildCastleCourtyardArt,
    enchanted_forest: (await import('../src/game/maps/enchantedForestArt')).buildEnchantedForestArt,
    frozen_fortress: (await import('../src/game/maps/frozenFortressArt')).buildFrozenFortressArt,
    wizard_tower: (await import('../src/game/maps/wizardTowerArt')).buildWizardTowerArt,
    ancient_ruins: (await import('../src/game/maps/ancientRuinsArt')).buildAncientRuinsArt,
    volcanic_keep: (await import('../src/game/maps/volcanicKeepArt')).buildVolcanicKeepArt,
  } as const;
  for (const id of STAGE_ORDER) {
    const art = builders[id]();
    const view = new PixelBuffer(640, 360);
    const scrollX = REF_CENTER.x - 320;
    const scrollY = REF_CENTER.y - 180;
    for (const l of art.parallax) {
      const p = parallaxPosition(l);
      view.blit(l.buf, Math.round(p.x - scrollX * l.sf), Math.round(p.y - scrollY * l.sf));
    }
    view.blit(art.world.buf, art.world.x - scrollX, art.world.y - scrollY);
    // spawn markers (feet) to check that the art matches the collision data
    for (const s of STAGES[id].spawns) view.rect(s.x - scrollX - 1, s.y - scrollY - 3, 3, 3, 0xff00ff);
    save(`stage_${id}.png`, view, 2);
  }
});
