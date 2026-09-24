import { describe, expect, it } from 'vitest';
import { CHARACTERS, STAGES } from '@magiclash/shared';
import { SFX } from '../src/game/audio/sfx';
import { ATTACK_ANIMS, STYLES } from '../src/game/render/fighterSprite';
import { SLASHES } from '../src/game/render/effectSprites';

/**
 * Data ↔ presentation contract: every id referenced by gameplay data must exist in the
 * renderer/audio, otherwise a move plays silently or without animation.
 */
const KNOWN_EFFECTS = new Set([
  ...Object.keys(SLASHES),
  'none', 'thrust', 'thrust_down', 'plunge', 'spin',
  'fire_arc', 'frost_arc', 'fire_burst', 'frost_burst', 'shock_arc', 'fire_trail', 'frost_trail', 'shock_trail',
  // Temporada 1
  'whip_side', 'whip_up', 'whip_low', 'whip_heavy', 'whip_air_up', 'whip_air_down', 'whip_spin',
  'dark_slash', 'dark_low', 'dark_trail', 'bat_trail', 'arcane_trail', 'blood_burst', 'feather_trail', 'teleport',
]);
const PROJECTILE_SPRITES = new Set([
  'arrow', 'arrow_heavy', 'axe', 'fireball', 'great_fireball', 'fire_column', 'ice_shard', 'ice_lance',
  'ice_spikes', 'spark_bolt', 'thunder_beam', 'sky_spark', 'ball_lightning', 'thunderstrike',
  'dagger', 'azure_flame', 'azure_orb', 'rune_disc', 'azure_pillar', 'hellflame', 'inferno_orb', 'hell_geyser',
  'crimson_wave', 'dove', 'cat', 'phoenix', 'dragon', 'turtle',
]);
const HIT_EFFECTS = new Set(['spark', 'spark_big', 'explosion', 'frost', 'shock', 'arcane', 'blood', 'feather']);

describe('asset contract', () => {
  for (const c of Object.values(CHARACTERS)) {
    it(`${c.id}: style, anims, sounds, effects exist`, () => {
      expect(STYLES[c.id], 'style').toBeDefined();
      for (const a of c.attacks) {
        expect(ATTACK_ANIMS[a.anim], `${a.id} anim ${a.anim}`).toBeDefined();
        expect(SFX[a.sound as keyof typeof SFX], `${a.id} sound ${a.sound}`).toBeTypeOf('function');
        expect(KNOWN_EFFECTS.has(a.effect), `${a.id} effect ${a.effect}`).toBe(true);
      }
      for (const p of c.projectiles ?? []) {
        expect(PROJECTILE_SPRITES.has(p.sprite), `${p.id} sprite ${p.sprite}`).toBe(true);
        expect(HIT_EFFECTS.has(p.hitEffect), `${p.id} hit ${p.hitEffect}`).toBe(true);
        if (p.sound) expect(SFX[p.sound as keyof typeof SFX], `${p.id} sound ${p.sound}`).toBeTypeOf('function');
      }
    });
  }

  it('every stage has art', async () => {
    const { buildCastleCourtyardArt } = await import('../src/game/maps/castleCourtyardArt');
    const { buildEnchantedForestArt } = await import('../src/game/maps/enchantedForestArt');
    const { buildFrozenFortressArt } = await import('../src/game/maps/frozenFortressArt');
    const { buildWizardTowerArt } = await import('../src/game/maps/wizardTowerArt');
    const { buildAncientRuinsArt } = await import('../src/game/maps/ancientRuinsArt');
    const { buildVolcanicKeepArt } = await import('../src/game/maps/volcanicKeepArt');
    const { buildThroneHallArt } = await import('../src/game/maps/throneHallArt');
    const { buildHuntersLibraryArt } = await import('../src/game/maps/huntersLibraryArt');
    const builders: Record<string, () => unknown> = {
      castle_courtyard: buildCastleCourtyardArt,
      enchanted_forest: buildEnchantedForestArt,
      frozen_fortress: buildFrozenFortressArt,
      wizard_tower: buildWizardTowerArt,
      ancient_ruins: buildAncientRuinsArt,
      volcanic_keep: buildVolcanicKeepArt,
      throne_hall: buildThroneHallArt,
      hunters_library: buildHuntersLibraryArt,
    };
    for (const id of Object.keys(STAGES)) {
      expect(builders[id], id).toBeDefined();
      expect(() => builders[id](), id).not.toThrow();
    }
  });
});
