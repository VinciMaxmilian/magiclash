import type { StageDefinition } from '../../physics/stage';

/**
 * ENCHANTED FOREST — uma grande raiz/rocha coberta de musgo no meio da floresta mágica.
 * Plataforma principal um pouco mais estreita e galhos baixos nas laterais: favorece
 * combate aéreo e personagens de mobilidade (arqueiro, raio).
 */
export const ENCHANTED_FOREST: StageDefinition = {
  id: 'enchanted_forest',
  name: 'Enchanted Forest',
  solids: [
    { x: -160, y: 0, w: 320, h: 36 },
    { x: -128, y: 36, w: 256, h: 90 },
  ],
  platforms: [
    { x: -200, y: -52, w: 72 },
    { x: 128, y: -52, w: 72 },
    { x: -48, y: -118, w: 96 },
  ],
  blastZone: { left: -420, right: 420, top: -390, bottom: 250 },
  spawns: [
    { x: -90, y: 0, facing: 1 },
    { x: 90, y: 0, facing: -1 },
    { x: -164, y: -52, facing: 1 },
    { x: 164, y: -52, facing: -1 },
  ],
  respawns: [
    { x: -40, y: -200 },
    { x: 40, y: -200 },
    { x: -80, y: -200 },
    { x: 80, y: -200 },
  ],
  camera: { minX: -100, maxX: 100, minY: -140, maxY: 30 },
};
