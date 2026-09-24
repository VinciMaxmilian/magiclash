import type { StageDefinition } from '../../physics/stage';

/**
 * VOLCANIC KEEP — fortaleza pequena sobre um mar de lava. Palco curto e plataformas baixas nas
 * bordas: combate próximo e agressivo, pouco espaço para quem só foge. A lava é só cenário
 * (a morte continua sendo pela blast zone, igual em todos os mapas).
 */
export const VOLCANIC_KEEP: StageDefinition = {
  id: 'volcanic_keep',
  name: 'Volcanic Keep',
  solids: [
    { x: -144, y: 0, w: 288, h: 40 },
    { x: -112, y: 40, w: 224, h: 100 },
  ],
  platforms: [
    { x: -176, y: -44, w: 64 },
    { x: 112, y: -44, w: 64 },
    { x: -40, y: -104, w: 80 },
  ],
  blastZone: { left: -410, right: 410, top: -380, bottom: 240 },
  spawns: [
    { x: -84, y: 0, facing: 1 },
    { x: 84, y: 0, facing: -1 },
    { x: -28, y: 0, facing: 1 },
    { x: 28, y: 0, facing: -1 },
  ],
  respawns: [
    { x: -36, y: -200 },
    { x: 36, y: -200 },
    { x: -76, y: -200 },
    { x: 76, y: -200 },
  ],
  camera: { minX: -100, maxX: 100, minY: -130, maxY: 30 },
};
