import type { CharacterDefinition } from '../characters/types';
import type { StageDefinition } from '../physics/stage';
import { KNIGHT } from './characters/knight';
import { CASTLE_COURTYARD } from './stages/castleCourtyard';

export const CHARACTERS: Readonly<Record<string, CharacterDefinition>> = {
  [KNIGHT.id]: KNIGHT,
};

export const STAGES: Readonly<Record<string, StageDefinition>> = {
  [CASTLE_COURTYARD.id]: CASTLE_COURTYARD,
};

export const getCharacter = (id: string): CharacterDefinition => {
  const c = CHARACTERS[id];
  if (!c) throw new Error(`Unknown character: ${id}`);
  return c;
};

export const getStage = (id: string): StageDefinition => {
  const s = STAGES[id];
  if (!s) throw new Error(`Unknown stage: ${id}`);
  return s;
};

export { KNIGHT, CASTLE_COURTYARD };
