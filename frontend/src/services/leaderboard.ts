import { ApiError, account } from './account';

/** Public leaderboards (backend `GET /api/leaderboard`). Read-only; ratings are computed server-side. */

export type LeaderboardPeriod = 'season' | 'week' | 'month' | 'character';

export interface LeaderboardEntry {
  position: number;
  username: string;
  avatar_id: string;
  avatar_url: string | null;
  score: number;
  rating: number;
  wins: number;
  losses: number;
  matches: number;
  me: boolean;
}

export interface Leaderboard {
  period: LeaderboardPeriod;
  character: string | null;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

export async function fetchLeaderboard(period: LeaderboardPeriod, character: string | null, limit = 10): Promise<Leaderboard> {
  const q = new URLSearchParams({ queue: '1v1', period, limit: String(limit) });
  if (period === 'character' && character) q.set('character', character);
  // The account token (if any) only personalises the answer ("your position").
  const token = account.accessToken;
  let r: Response;
  try {
    r = await fetch(`${API_URL}/api/leaderboard?${q}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  } catch {
    throw new ApiError(0, 'offline');
  }
  if (!r.ok) throw new ApiError(r.status, 'error');
  return (await r.json()) as Leaderboard;
}
