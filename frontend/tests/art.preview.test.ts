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
