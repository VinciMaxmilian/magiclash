import { ApiError, account, guestName } from './account';

/**
 * Online entry points (backend): identity for guests, private rooms, matchmaking.
 * The backend answers with a short-lived JOIN TOKEN for the realtime server.
 */

export interface JoinInfo {
  token: string;
  realtime_url: string;
  match_id: string;
  code: string | null;
  mode: 'ffa' | 'teams';
  stage: string;
  stocks: number;
  max_players: number;
}

export interface Ticket {
  ticket_id: string;
  status: 'searching' | 'matched' | 'cancelled' | 'expired' | 'closed';
  join: JoinInfo | null;
}

const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
const GUEST_TOKEN_KEY = 'magiclash.guestToken';

interface GuestToken {
  token: string;
  name: string;
  expiresAt: number;
}

const readGuest = (): GuestToken | null => {
  try {
    const g = JSON.parse(sessionStorage.getItem(GUEST_TOKEN_KEY) ?? 'null') as GuestToken | null;
    return g && g.expiresAt > Date.now() + 60_000 && g.name === guestName() ? g : null;
  } catch {
    return null;
  }
};

async function request<T>(path: string, init: RequestInit, bearer?: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, typeof body.error === 'string' ? body.error : 'error');
  return body as T;
}

/** Bearer for online calls: the account's Supabase token, or a guest token we obtain. */
async function identity(): Promise<string> {
  if (account.signedIn && account.accessToken) return account.accessToken;
  const cached = readGuest();
  if (cached) return cached.token;
  const name = guestName() === 'VISITANTE' ? `Guest${Math.floor(1000 + Math.random() * 9000)}` : guestName();
  const g = await request<{ token: string; expires_in: number; name: string }>('/api/auth/guest', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  try {
    sessionStorage.setItem(GUEST_TOKEN_KEY, JSON.stringify({ token: g.token, name: guestName(), expiresAt: Date.now() + g.expires_in * 1000 }));
  } catch {
    /* no storage: token lives only in this call chain */
  }
  return g.token;
}

export const online = {
  get available(): boolean {
    return Boolean(API_URL);
  },

  async createRoom(mode: 'duel' | 'ffa' | 'teams', stage: string, stocks: number): Promise<JoinInfo> {
    return request('/api/rooms', { method: 'POST', body: JSON.stringify({ mode, stage, stocks }) }, await identity());
  },

  async joinRoom(code: string): Promise<JoinInfo> {
    const clean = code.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(clean)) throw new ApiError(404, 'room_not_found');
    return request(`/api/rooms/${clean}/join`, { method: 'POST' }, await identity());
  },

  async enqueue(): Promise<Ticket> {
    return request('/api/matchmaking/tickets', { method: 'POST', body: JSON.stringify({ queue: '1v1' }) }, await identity());
  },

  async poll(ticketId: string): Promise<Ticket> {
    return request(`/api/matchmaking/tickets/${ticketId}`, { method: 'GET' }, await identity());
  },

  async cancel(ticketId: string): Promise<void> {
    await request(`/api/matchmaking/tickets/${ticketId}`, { method: 'DELETE' }, await identity()).catch(() => undefined);
  },
};
