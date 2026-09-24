import type Phaser from 'phaser';
import castleCourtyard from '../../assets/backdrops/castle_courtyard.png';
import enchantedForest from '../../assets/backdrops/enchanted_forest.png';
import frozenFortress from '../../assets/backdrops/frozen_fortress.png';
import wizardTower from '../../assets/backdrops/wizard_tower.png';
import ancientRuins from '../../assets/backdrops/ancient_ruins.png';
import volcanicKeep from '../../assets/backdrops/volcanic_keep.png';
import title from '../../assets/backdrops/title.png';

/**
 * Painted far backdrops (Higgsfield generations, reduced to 640×360 + parallax margin and
 * quantized to the master palette by tools/process_backdrops.py — docs/ASSETS.md §10).
 * When a stage's backdrop is loaded it replaces the procedural sky/far/mid layers; the
 * playable world and the foreground stay procedural. If loading fails the procedural art is used.
 */
export const BACKDROP_SF = 0.05;

const STAGE_BACKDROPS: Record<string, string> = {
  castle_courtyard: castleCourtyard,
  enchanted_forest: enchantedForest,
  frozen_fortress: frozenFortress,
  wizard_tower: wizardTower,
  ancient_ruins: ancientRuins,
  volcanic_keep: volcanicKeep,
};

export const TITLE_ART_KEY = 'title_art';

export const backdropKey = (stageId: string): string => `backdrop_${stageId}`;

export const stagesWithBackdrop = (): string[] => Object.keys(STAGE_BACKDROPS);

/** Queues every backdrop on the scene's loader (call from `preload`). */
export const preloadBackdrops = (scene: Phaser.Scene): void => {
  for (const [id, url] of Object.entries(STAGE_BACKDROPS)) scene.load.image(backdropKey(id), url);
  scene.load.image(TITLE_ART_KEY, title);
};
