import type { StageDefinition } from '../../physics/stage';

/**
 * THRONE HALL (Temporada 1) — salão do trono de um castelo vampírico. Chão largo com um estrado
 * baixo no centro (degrau que quebra projéteis rasteiros) e três lustres como plataformas.
 */
export const THRONE_HALL: StageDefinition = {
  id: 'throne_hall',
  name: 'Throne Hall',
  solids: [
    { x: -48, y: -14, w: 96, h: 14 },
    { x: -208, y: 0, w: 416, h: 40 },
    { x: -170, y: 40, w: 340, h: 96 },
  ],
  platforms: [
    { x: -156, y: -84, w: 60 },
    { x: 96, y: -84, w: 60 },
    { x: -36, y: -146, w: 72 },
  ],
  blastZone: { left: -470, right: 470, top: -420, bottom: 260 },
  spawns: [
    { x: -120, y: 0, facing: 1 },
    { x: 120, y: 0, facing: -1 },
    { x: -170, y: 0, facing: 1 },
    { x: 170, y: 0, facing: -1 },
  ],
  respawns: [
    { x: -40, y: -230 },
    { x: 40, y: -230 },
    { x: -100, y: -230 },
    { x: 100, y: -230 },
  ],
  camera: { minX: -130, maxX: 130, minY: -160, maxY: 30 },
};
