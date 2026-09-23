/**
 * Deterministic PRNG (mulberry32). State is a plain number so it can live inside the
 * serializable simulation state. Never use Math.random() inside the simulation.
 */
export interface RngState {
  s: number;
}

export const createRng = (seed: number): RngState => ({ s: seed >>> 0 });

/** Returns a float in [0, 1) and advances the state. */
export const nextFloat = (rng: RngState): number => {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const nextRange = (rng: RngState, min: number, max: number): number =>
  min + nextFloat(rng) * (max - min);

export const nextInt = (rng: RngState, minInclusive: number, maxInclusive: number): number =>
  Math.floor(nextRange(rng, minInclusive, maxInclusive + 1));

export const chance = (rng: RngState, p: number): boolean => nextFloat(rng) < p;
