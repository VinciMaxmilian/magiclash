import type { BotDifficulty } from '@magiclash/shared';

/**
 * Per-device preferences. localStorage is only a convenience: every read/write is guarded
 * and the game works with defaults when storage is unavailable (private mode, blocked).
 * Nothing competitive is ever stored here.
 */
export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  difficulty: BotDifficulty;
}

const KEY = 'magiclash.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  difficulty: 'medium',
};

const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);

export const loadSettings = (): Settings => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      masterVolume: clamp01(p.masterVolume, DEFAULT_SETTINGS.masterVolume),
      musicVolume: clamp01(p.musicVolume, DEFAULT_SETTINGS.musicVolume),
      sfxVolume: clamp01(p.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      difficulty: ['easy', 'medium', 'hard'].includes(p.difficulty as string)
        ? (p.difficulty as BotDifficulty)
        : DEFAULT_SETTINGS.difficulty,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveSettings = (s: Settings): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: keep in memory only */
  }
};
