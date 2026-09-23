import Phaser from 'phaser';
import { PixelBuffer } from '../render/pixelBuffer';
import { buildCastleCourtyardArt, parallaxPosition, type StageArt } from './castleCourtyardArt';
import { EFFECT_ORIGINS } from '../render/textures';
import type { EffectManager } from '../effects/EffectManager';
import { PAL } from '../render/palette';

const ART_BUILDERS: Record<string, () => StageArt> = {
  castle_courtyard: buildCastleCourtyardArt,
};

let cache: { id: string; art: StageArt } | null = null;

const addBufferTexture = (scene: Phaser.Scene, key: string, buf: PixelBuffer) => {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, buf.w, buf.h)!;
  buf.putOn(tex.getContext(), 0, 0);
  tex.refresh();
};

interface Flame {
  sprite: Phaser.GameObjects.Sprite;
  phase: number;
  worldX: number;
  worldY: number;
  sf: number;
}

/**
 * Renders a stage's art. Gameplay geometry comes from the shared StageDefinition; this class
 * only draws it (plus ambience) and never affects collisions.
 */
export class StageView {
  private flames: Flame[] = [];
  private t = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    stageId: string,
    private readonly fx?: EffectManager,
  ) {
    if (!cache || cache.id !== stageId) {
      const build = ART_BUILDERS[stageId];
      if (!build) throw new Error(`No art for stage ${stageId}`);
      cache = { id: stageId, art: build() };
    }
    const art = cache.art;

    for (const l of art.parallax) {
      addBufferTexture(scene, l.key, l.buf);
      const p = parallaxPosition(l);
      scene.add.image(p.x, p.y, l.key).setOrigin(0, 0).setScrollFactor(l.sf).setDepth(l.depth);
    }
    addBufferTexture(scene, art.world.key, art.world.buf);
    scene.add.image(art.world.x, art.world.y, art.world.key).setOrigin(0, 0).setDepth(art.world.depth);

    const flameMeta = EFFECT_ORIGINS.get('fx_flame');
    for (const [i, t] of art.torches.entries()) {
      const layer = art.parallax.find((l) => l.key === t.layer)!;
      const p = parallaxPosition(layer);
      const sprite = scene.add.sprite(p.x + t.u, p.y + t.v, 'fx_flame', 0);
      if (flameMeta) sprite.setOrigin(flameMeta.x / 5, flameMeta.y / 7);
      sprite.setScrollFactor(layer.sf).setDepth(layer.depth + 1);
      this.flames.push({ sprite, phase: i * 7, worldX: p.x + t.u, worldY: p.y + t.v, sf: layer.sf });
    }
  }

  /** `dt` in 60 Hz ticks. */
  update(dt: number): void {
    this.t += dt;
    for (const f of this.flames) {
      const frame = Math.floor((this.t + f.phase) / 6) % 3;
      f.sprite.setFrame(frame);
    }
    // Rare drifting embers near the arena for life, never dense enough to distract.
    if (this.fx && Math.random() < 0.02 * dt) {
      const x = -200 + Math.random() * 400;
      this.fx.burst(x, 40 + Math.random() * 40, 1, [PAL.fire[2], PAL.fire[3]], {
        speed: 0.4,
        gravity: -0.01,
        life: 120,
        angle: -Math.PI / 2,
        spread: 0.8,
        drag: 0.995,
      });
    }
  }
}
