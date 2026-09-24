import type { MatchConfig, SimEvent, SimState } from '../sim/types';

/**
 * Realtime wire protocol (JSON over WebSocket, permessage-deflate). The client only ever
 * sends identity (join token), lobby choices and button bits. Everything else — positions,
 * damage, cooldowns, KOs, results — is computed by the server's Simulation.
 */

export const PROTOCOL_VERSION = 1;
export const SNAPSHOT_EVERY_TICKS = 2; // 30 Hz snapshots from a 60 Hz simulation
export const INPUT_REDUNDANCY = 4; // each input message carries the last N inputs
export const MAX_MESSAGE_BYTES = 1024;

export const COLORS = ['blue', 'red', 'green', 'yellow'] as const;
export type ColorId = (typeof COLORS)[number];

export type ClientMsg =
  | { t: 'auth'; token: string; v: number }
  | { t: 'pick'; character: string; color: ColorId }
  | { t: 'team'; team: 0 | 1 }
  | { t: 'ready'; ready: boolean }
  /** `s` = sequence of the newest input; `i` = inputs newest-first (redundancy). */
  | { t: 'in'; s: number; i: number[] }
  | { t: 'ping'; id: number }
  | { t: 'leave' };

export interface LobbyPlayer {
  slot: number;
  name: string;
  /** Path in the public avatars bucket (validated server-side), or null. */
  avatar: string | null;
  kind: 'user' | 'guest';
  character: string;
  color: ColorId;
  team: number;
  ready: boolean;
  connected: boolean;
}

export interface SlotInfo {
  slot: number;
  name: string;
  avatar?: string | null;
  character: string;
  color: ColorId;
  team: number;
}

/** Rating change of one slot in a rated match (computed by the database, relayed by the GS). */
export interface RatingChange {
  slot: number;
  before: number;
  after: number;
}

export interface EndFighter extends SlotInfo {
  stats: SimState['fighters'][number]['stats'];
  stocks: number;
}

export type ServerMsg =
  | {
      t: 'welcome';
      slot: number;
      match: string;
      room: string | null;
      mode: 'ffa' | 'teams';
      stage: string;
      stocks: number;
      maxPlayers: number;
      ranked: boolean;
    }
  | { t: 'lobby'; players: LobbyPlayer[]; host: number }
  | { t: 'start'; config: MatchConfig; slots: SlotInfo[]; you: number }
  /** Snapshot: tick, full sim state, events since the previous snapshot, last input seq applied for you. */
  | { t: 'snap'; k: number; s: SimState; ev: SimEvent[]; ack: number }
  | { t: 'end'; winnerTeam: number; durationTicks: number; fighters: EndFighter[]; recorded: boolean; ratings: RatingChange[] }
  | { t: 'pong'; id: number; st: number }
  | { t: 'error'; code: string };

/** Numbers rounded to 2 decimals keep snapshots small without affecting rendering. */
export const compactReplacer = (_k: string, v: unknown): unknown =>
  typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v;
