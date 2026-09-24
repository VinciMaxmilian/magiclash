import type { CharacterDefinition } from '../characters/types';
import type { StageDefinition } from '../physics/stage';
import { KNIGHT } from './characters/knight';
import { BARBARIAN } from './characters/barbarian';
import { ARCHER } from './characters/archer';
import { FIRE_MAGE, ICE_MAGE, LIGHTNING_MAGE } from './characters/mages';
import { CASTLE_COURTYARD } from './stages/castleCourtyard';
import { ENCHANTED_FOREST } from './stages/enchantedForest';
import { FROZEN_FORTRESS } from './stages/frozenFortress';
import { WIZARD_TOWER } from './stages/wizardTower';
import { ANCIENT_RUINS } from './stages/ancientRuins';
import { VOLCANIC_KEEP } from './stages/volcanicKeep';
import { THRONE_HALL } from './stages/throneHall';
import { HUNTERS_LIBRARY } from './stages/huntersLibrary';
import { BRAWLER, DHAMPIR, HUNTER, SUMMONER, VAMPIRE } from './characters/season1';

export const CHARACTERS: Readonly<Record<string, CharacterDefinition>> = {
  [KNIGHT.id]: KNIGHT,
  [BARBARIAN.id]: BARBARIAN,
  [ARCHER.id]: ARCHER,
  [FIRE_MAGE.id]: FIRE_MAGE,
  [ICE_MAGE.id]: ICE_MAGE,
  [LIGHTNING_MAGE.id]: LIGHTNING_MAGE,
  [HUNTER.id]: HUNTER,
  [BRAWLER.id]: BRAWLER,
  [VAMPIRE.id]: VAMPIRE,
  [DHAMPIR.id]: DHAMPIR,
  [SUMMONER.id]: SUMMONER,
};

/** Display order in character select. */
export const CHARACTER_ORDER = [
  'knight', 'barbarian', 'archer', 'fire_mage', 'ice_mage', 'lightning_mage',
  // Temporada 1
  'hunter', 'brawler', 'vampire', 'dhampir', 'summoner',
] as const;

export const STAGES: Readonly<Record<string, StageDefinition>> = {
  [CASTLE_COURTYARD.id]: CASTLE_COURTYARD,
  [ENCHANTED_FOREST.id]: ENCHANTED_FOREST,
  [FROZEN_FORTRESS.id]: FROZEN_FORTRESS,
  [WIZARD_TOWER.id]: WIZARD_TOWER,
  [ANCIENT_RUINS.id]: ANCIENT_RUINS,
  [VOLCANIC_KEEP.id]: VOLCANIC_KEEP,
  [THRONE_HALL.id]: THRONE_HALL,
  [HUNTERS_LIBRARY.id]: HUNTERS_LIBRARY,
};

export const STAGE_ORDER = [
  'castle_courtyard',
  'enchanted_forest',
  'frozen_fortress',
  'wizard_tower',
  'ancient_ruins',
  'volcanic_keep',
  'throne_hall',
  'hunters_library',
] as const;

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

export { KNIGHT, BARBARIAN, ARCHER, FIRE_MAGE, ICE_MAGE, LIGHTNING_MAGE, CASTLE_COURTYARD, ENCHANTED_FOREST, FROZEN_FORTRESS, WIZARD_TOWER, ANCIENT_RUINS, VOLCANIC_KEEP, THRONE_HALL, HUNTERS_LIBRARY, HUNTER, BRAWLER, VAMPIRE, DHAMPIR, SUMMONER };
