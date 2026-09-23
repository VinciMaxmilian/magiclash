import Phaser from 'phaser';
import { FONT, FONT_OUTLINE } from '../game/render/textures';
import { fontSafe } from './pixelFont';

export interface TextOptions {
  outline?: boolean;
  /** Integer scale only (pixel rule). Headline text may use 2×/3×/4×. */
  scale?: 1 | 2 | 3 | 4;
  color?: number;
  align?: 'left' | 'center' | 'right';
  depth?: number;
  fixed?: boolean;
}

/** Bitmap pixel text with integer positioning. Anchored by `align` on x, top on y. */
export const pixelText = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts: TextOptions = {},
): Phaser.GameObjects.BitmapText => {
  const t = scene.add.bitmapText(Math.round(x), Math.round(y), opts.outline === false ? FONT : FONT_OUTLINE, fontSafe(text));
  t.setScale(opts.scale ?? 1);
  if (opts.color !== undefined) t.setTint(opts.color);
  const align = opts.align ?? 'left';
  t.setOrigin(align === 'center' ? 0.5 : align === 'right' ? 1 : 0, 0);
  if (opts.depth !== undefined) t.setDepth(opts.depth);
  if (opts.fixed !== false) t.setScrollFactor(0);
  return t;
};

export const setPixelText = (t: Phaser.GameObjects.BitmapText, text: string): void => {
  t.setText(fontSafe(text));
};
