import type { StageDefinition } from '../../physics/stage';

/**
 * HUNTERS' LIBRARY (Temporada 1) — arquivo secreto de uma ordem de caçadores. Chão médio e
 * prateleiras em escada dos dois lados até uma galeria alta no centro: muito jogo vertical.
 */
export const HUNTERS_LIBRARY: StageDefinition = {
  id: 'hunters_library',
  name: "Hunters' Library",
  solids: [
    { x: -176, y: 0, w: 352, h: 40 },
    { x: -140, y: 40, w: 280, h: 100 },
  ],
  platforms: [
    { x: -172, y: -58, w: 60 },
    { x: 112, y: -58, w: 60 },
    { x: -104, y: -118, w: 56 },
    { x: 48, y: -118, w: 56 },
    { x: -30, y: -178, w: 60 },
  ],
  blastZone: { left: -430, right: 430, top: -440, bottom: 260 },
  spawns: [
    { x: -90, y: 0, facing: 1 },
    { x: 90, y: 0, facing: -1 },
    { x: -142, y: -58, facing: 1 },
    { x: 142, y: -58, facing: -1 },
  ],
  respawns: [
    { x: -32, y: -250 },
    { x: 32, y: -250 },
    { x: -80, y: -250 },
    { x: 80, y: -250 },
  ],
  camera: { minX: -110, maxX: 110, minY: -180, maxY: 30 },
};
