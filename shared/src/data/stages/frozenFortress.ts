import type { StageDefinition } from '../../physics/stage';

/**
 * FROZEN FORTRESS — muralha congelada larga, com duas plataformas de gelo em alturas
 * diferentes (layout assimétrico). Espaço amplo favorece zoners (magos, arqueiro).
 */
export const FROZEN_FORTRESS: StageDefinition = {
  id: 'frozen_fortress',
  name: 'Frozen Fortress',
  solids: [
    { x: -192, y: 0, w: 384, h: 44 },
    { x: -160, y: 44, w: 320, h: 96 },
  ],
  platforms: [
    { x: -150, y: -70, w: 80 },
    { x: 60, y: -104, w: 96 },
  ],
  blastZone: { left: -450, right: 450, top: -400, bottom: 260 },
  spawns: [
    { x: -110, y: 0, facing: 1 },
    { x: 110, y: 0, facing: -1 },
    { x: -40, y: 0, facing: 1 },
    { x: 40, y: 0, facing: -1 },
  ],
  respawns: [
    { x: -40, y: -210 },
    { x: 40, y: -210 },
    { x: -90, y: -210 },
    { x: 90, y: -210 },
  ],
  camera: { minX: -120, maxX: 120, minY: -150, maxY: 30 },
};
