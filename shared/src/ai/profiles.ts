export type BotDifficulty = 'easy' | 'medium' | 'hard';

/**
 * Difficulty is behaviour, not stats: bots never get extra damage/speed. They differ in how
 * fast they perceive, how well they choose, and how often they make mistakes.
 */
export interface BotProfile {
  /** Ticks of delay between the world changing and the bot "seeing" it. */
  reactionTicks: number;
  /** Ticks between neutral-game decisions. */
  decisionInterval: number;
  /** 0..1 — how much it prefers approaching/attacking over waiting. */
  aggression: number;
  /** 0..1 — chance to pick the best attack instead of a random viable one. */
  accuracy: number;
  /** 0..1 — chance to react to an incoming attack by dodging/jumping away. */
  dodgeSkill: number;
  /** 0..1 — chance to follow up a hit (chase / juggle). */
  comboSkill: number;
  /** 0..1 — chance per decision to recover correctly when offstage. */
  recoverySkill: number;
  /** 0..1 — chance to throw out a pointless attack or wander. */
  mistakeRate: number;
  /** Go to the ledge and punish recovering opponents. */
  edgeGuard: boolean;
  /** Preferred horizontal gap when not attacking (px). */
  spacing: number;
}

export const BOT_PROFILES: Readonly<Record<BotDifficulty, BotProfile>> = {
  easy: {
    reactionTicks: 24,
    decisionInterval: 16,
    aggression: 0.35,
    accuracy: 0.45,
    dodgeSkill: 0.08,
    comboSkill: 0.15,
    recoverySkill: 0.55,
    mistakeRate: 0.25,
    edgeGuard: false,
    spacing: 70,
  },
  medium: {
    reactionTicks: 16,
    decisionInterval: 10,
    aggression: 0.55,
    accuracy: 0.7,
    dodgeSkill: 0.25,
    comboSkill: 0.4,
    recoverySkill: 0.85,
    mistakeRate: 0.15,
    edgeGuard: true,
    spacing: 55,
  },
  hard: {
    reactionTicks: 7,
    decisionInterval: 5,
    aggression: 0.8,
    accuracy: 0.93,
    dodgeSkill: 0.65,
    comboSkill: 0.85,
    recoverySkill: 1,
    mistakeRate: 0.03,
    edgeGuard: true,
    spacing: 45,
  },
};
