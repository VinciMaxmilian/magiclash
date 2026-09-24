import type { StageDefinition } from '../../physics/stage';

/**
 * WIZARD TOWER — topo estreito de uma torre arcana com três níveis de runas flutuantes.
 * Chão curto (16 tiles) e muita verticalidade: favorece quem luta no ar e pune recuos longos.
 */
export const WIZARD_TOWER: StageDefinition = {
  id: 'wizard_tower',
  name: 'Wizard Tower',
  solids: [
    { x: -128, y: 0, w: 256, h: 36 },
    { x: -96, y: 36, w: 192, h: 120 },
  ],
  platforms: [
    { x: -124, y: -64, w: 64 },
    { x: 60, y: -64, w: 64 },
    { x: -32, y: -124, w: 64 },
    { x: -100, y: -184, w: 56 },
    { x: 44, y: -184, w: 56 },
  ],
  blastZone: { left: -390, right: 390, top: -440, bottom: 260 },
  spawns: [
    { x: -72, y: 0, facing: 1 },
    { x: 72, y: 0, facing: -1 },
    { x: -92, y: -64, facing: 1 },
    { x: 92, y: -64, facing: -1 },
  ],
  respawns: [
    { x: -32, y: -250 },
    { x: 32, y: -250 },
    { x: -72, y: -250 },
    { x: 72, y: -250 },
  ],
  camera: { minX: -90, maxX: 90, minY: -180, maxY: 30 },
};
