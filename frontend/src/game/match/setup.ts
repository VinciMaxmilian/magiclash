import type { BotDifficulty } from '@magiclash/shared';
import type { TeamColor } from '../render/palette';

/** One slot of a local match (the online version will come from the realtime server). */
export interface SlotSetup {
  characterId: string;
  color: TeamColor;
  /** Simulation team: equal teams can't hurt each other. FFA = everyone different. */
  team: number;
  label: string;
  bot: BotDifficulty | null;
  /** Uploaded profile photo shown in the HUD instead of the class portrait. */
  avatarUrl?: string | null;
}

export interface MatchSetup {
  stageId: string;
  slots: SlotSetup[];
  stocks: number;
  /** Seconds, 0 = unlimited. */
  timeLimit: number;
  mode: 'ffa' | 'teams';
}

export const defaultSetup = (difficulty: BotDifficulty): MatchSetup => ({
  stageId: 'castle_courtyard',
  slots: [
    { characterId: 'knight', color: 'blue', team: 0, label: 'P1', bot: null },
    { characterId: 'knight', color: 'red', team: 1, label: 'CPU', bot: difficulty },
  ],
  stocks: 3,
  timeLimit: 240,
  mode: 'ffa',
});
