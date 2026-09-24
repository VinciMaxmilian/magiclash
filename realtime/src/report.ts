import { createHmac } from 'node:crypto';
import type { RatingChange } from '@magiclash/shared';
import { log } from './log';

export interface ResultParticipant {
  slot: number;
  kind: 'user' | 'guest';
  id: string;
  name: string;
  character_id: string;
  team: number;
  placement: number;
  kos: number;
  deaths: number;
  damage_dealt: number;
}

export interface MatchReport {
  duration_ticks: number;
  winner_team: number;
  participants: ResultParticipant[];
  suspicious: string[];
}

export interface ReportOutcome {
  recorded: boolean;
  /** Empty unless the match was rated. */
  ratings: RatingChange[];
}

export type Reporter = (matchId: string, report: MatchReport) => Promise<ReportOutcome>;

const NOT_RECORDED: ReportOutcome = { recorded: false, ratings: [] };

const parseRatings = (body: unknown): RatingChange[] => {
  const list = (body as { ratings?: unknown } | null)?.ratings;
  if (!Array.isArray(list)) return [];
  return list
    .filter((r): r is RatingChange => [r?.slot, r?.before, r?.after].every((v) => Number.isInteger(v)))
    .slice(0, 4)
    .map(({ slot, before, after }) => ({ slot, before, after }));
};

/**
 * Posts the authoritative result to the backend, signed with HMAC-SHA256(ts + "." + body).
 * Retries transient failures; a 409 (already recorded) counts as success (without ratings).
 */
export const createReporter =
  (apiUrl: string, secret: string, fetchImpl: typeof fetch = fetch): Reporter =>
  async (matchId, report) => {
    const body = JSON.stringify(report);
    for (let attempt = 0; attempt < 4; attempt++) {
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
      try {
        const r = await fetchImpl(`${apiUrl}/api/internal/matches/${matchId}/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Timestamp': ts, 'X-Signature': sig },
          body,
        });
        if (r.ok || r.status === 409) {
          log('MATCH_REPORTED', { match: matchId, status: r.status });
          const ratings = r.ok ? parseRatings(await r.json().catch(() => null)) : [];
          return { recorded: true, ratings };
        }
        if (r.status >= 400 && r.status < 500) {
          log('MATCH_REPORT_REJECTED', { match: matchId, status: r.status }, 'warn');
          return NOT_RECORDED;
        }
      } catch (e) {
        log('MATCH_REPORT_RETRY', { match: matchId, attempt, error: String(e).slice(0, 120) }, 'warn');
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
    return NOT_RECORDED;
  };
