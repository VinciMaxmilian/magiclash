import type { StageDefinition } from '../../physics/stage';

/**
 * CASTLE COURTYARD — pátio de castelo sobre uma muralha. Plataforma principal de pedra
 * (22 tiles), duas passarelas de madeira laterais e um balcão central alto.
 * Layout neutro/competitivo: bom para aprender e para testar balanceamento.
 */
export const CASTLE_COURTYARD: StageDefinition = {
  id: 'castle_courtyard',
  name: 'Castle Courtyard',
  solids: [
    { x: -176, y: 0, w: 352, h: 40 },
    { x: -152, y: 40, w: 304, h: 96 },
  ],
  platforms: [
    { x: -136, y: -76, w: 88 },
    { x: 48, y: -76, w: 88 },
    { x: -40, y: -148, w: 80 },
  ],
  blastZone: { left: -430, right: 430, top: -400, bottom: 260 },
  spawns: [
    { x: -96, y: 0, facing: 1 },
    { x: 96, y: 0, facing: -1 },
    { x: -92, y: -76, facing: 1 },
    { x: 92, y: -76, facing: -1 },
  ],
  respawns: [
    { x: -40, y: -210 },
    { x: 40, y: -210 },
    { x: -80, y: -210 },
    { x: 80, y: -210 },
  ],
  camera: { minX: -110, maxX: 110, minY: -150, maxY: 30 },
};
