import Phaser from 'phaser';
import { PixelBuffer } from '../render/pixelBuffer';
import { buildCastleCourtyardArt, parallaxPosition, type StageArt } from './castleCourtyardArt';
import { buildEnchantedForestArt } from './enchantedForestArt';
import { buildFrozenFortressArt } from './frozenFortressArt';
import { buildWizardTowerArt } from './wizardTowerArt';
import { buildAncientRuinsArt } from './ancientRuinsArt';
import { buildVolcanicKeepArt } from './volcanicKeepArt';
import { EFFECT_ORIGINS } from '../render/textures';
import type { EffectManager } from '../effects/EffectManager';
import { PAL } from '../render/palette';

const ART_BUILDERS: Record<string, () => StageArt> = {
  castle_courtyard: buildCastleCourtyardArt,
  enchanted_forest: buildEnchantedForestArt,
  frozen_fortress: buildFrozenFortressArt,
  wizard_tower: buildWizardTowerArt,
  ancient_ruins: buildAncientRuinsArt,
  volcanic_keep: buildVolcanicKeepArt,
};

const cache = new Map<string, StageArt>();

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
  private ambient: StageArt['ambient'] = 'embers';

  constructor(
    private readonly scene: Phaser.Scene,
    stageId: string,
    private readonly fx?: EffectManager,
  ) {
    let art = cache.get(stageId);
    if (!art) {
      const build = ART_BUILDERS[stageId];
      if (!build) throw new Error(`No art for stage ${stageId}`);
      art = build();
      cache.set(stageId, art);
    }
    this.ambient = art.ambient;

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
    // Light ambience, never dense enough to distract (and well under the particle budget).
    if (!this.fx) return;
    const cam = this.scene.cameras.main;
    if (this.ambient === 'embers' && Math.random() < 0.02 * dt) {
      this.fx.burst(-200 + Math.random() * 400, 40 + Math.random() * 40, 1, [PAL.fire[2], PAL.fire[3]], {
        speed: 0.4, gravity: -0.01, life: 120, angle: -Math.PI / 2, spread: 0.8, drag: 0.995,
      });
    } else if (this.ambient === 'fireflies' && Math.random() < 0.03 * dt) {
      this.fx.burst(cam.scrollX + Math.random() * 640, cam.scrollY + 60 + Math.random() * 260, 1, [PAL.lightning[4], PAL.moss[3], PAL.ice[3]], {
        speed: 0.25, gravity: 0, life: 150, drag: 1,
      });
    } else if (this.ambient === 'arcane' && Math.random() < 0.035 * dt) {
      this.fx.burst(cam.scrollX + Math.random() * 640, cam.scrollY + 200 + Math.random() * 160, 1, [PAL.lightning[3], PAL.lightning[2], PAL.lightning[4]], {
        speed: 0.35, gravity: -0.004, life: 170, angle: -Math.PI / 2, spread: 0.6, drag: 0.998,
      });
    } else if (this.ambient === 'snow' && Math.random() < 0.09 * dt) {
      this.fx.burst(cam.scrollX + Math.random() * 700 - 30, cam.scrollY - 4, 1, [PAL.white, PAL.ice[4], PAL.ice[3]], {
        speed: 0.5, gravity: 0.004, life: 280, angle: Math.PI / 2 + 0.25, spread: 0.5, drag: 0.999,
      });
    }
  }
}
