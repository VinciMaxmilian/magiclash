import type { Rect, Vec2 } from '../core/math';

/** Thin platform you can jump through from below and drop through with DOWN. */
export interface OneWayPlatform {
  x: number;
  y: number;
  w: number;
}

export interface BlastZone {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Gameplay geometry of a map. Visuals are separate (frontend `maps/`), so art can change
 * without touching collision, and the realtime server can load stages without any assets.
 */
export interface StageDefinition {
  id: string;
  name: string;
  /** Fully solid blocks (floor, walls, ceilings). */
  solids: Rect[];
  platforms: OneWayPlatform[];
  /** Crossing any side eliminates the fighter. */
  blastZone: BlastZone;
  /** Initial positions (feet), index = player slot. */
  spawns: (Vec2 & { facing: 1 | -1 })[];
  respawns: Vec2[];
  /** Limits for the camera CENTER (renderer only). */
  camera: { minX: number; maxX: number; minY: number; maxY: number };
}
