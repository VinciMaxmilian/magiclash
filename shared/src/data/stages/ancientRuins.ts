import type { StageDefinition } from '../../physics/stage';

/**
 * ANCIENT RUINS — templo em ruínas com chão em dois níveis: um degrau de pedra à esquerda cria
 * uma parede no meio do palco (bom para wall-jump e para se proteger de projéteis). Colunas
 * quebradas viram plataformas em alturas diferentes.
 */
export const ANCIENT_RUINS: StageDefinition = {
  id: 'ancient_ruins',
  name: 'Ancient Ruins',
  solids: [
    { x: -184, y: -28, w: 128, h: 28 },
    { x: -184, y: 0, w: 368, h: 44 },
    { x: -150, y: 44, w: 300, h: 90 },
  ],
  platforms: [
    { x: -150, y: -104, w: 72 },
    { x: 20, y: -60, w: 72 },
    { x: 96, y: -128, w: 64 },
  ],
  blastZone: { left: -450, right: 450, top: -400, bottom: 260 },
  spawns: [
    { x: -120, y: -28, facing: 1 },
    { x: 110, y: 0, facing: -1 },
    { x: -20, y: 0, facing: 1 },
    { x: 56, y: -60, facing: -1 },
  ],
  respawns: [
    { x: -40, y: -210 },
    { x: 40, y: -210 },
    { x: -90, y: -210 },
    { x: 90, y: -210 },
  ],
  camera: { minX: -120, maxX: 120, minY: -150, maxY: 30 },
};
