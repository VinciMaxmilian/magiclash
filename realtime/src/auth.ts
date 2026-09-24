import { jwtVerify } from 'jose';

/** Claims the backend puts in a join token (see backend/app/api/online.py). */
export interface JoinClaims {
  sub: string;
  kind: 'user' | 'guest';
  name: string;
  match: string;
  room: string | null;
  mode: 'ffa' | 'teams';
  stage: string;
  stocks: number;
  max_players: number;
  ranked: boolean;
  /** Storage path of the account's uploaded photo (avatars bucket). */
  avatar?: string;
  jti: string;
  exp: number;
}

const UUID = /^[0-9a-f-]{36}$/;
const GUEST = /^g_[0-9a-f]{16}$/;
const NAME = /^[A-Za-z0-9_]{3,16}$/;
const AVATAR = /^[0-9a-f-]{36}\/[0-9a-f]{32}\.webp$/;
const STAGES = new Set(['castle_courtyard', 'enchanted_forest', 'frozen_fortress']);

export class JoinTokenVerifier {
  private readonly key: Uint8Array;
  /** jti → expiry (ms). A token admits exactly one connection. */
  private readonly used = new Map<string, number>();

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async verify(token: string, now = Date.now()): Promise<JoinClaims> {
    if (typeof token !== 'string' || token.length > 4096) throw new Error('malformed');
    const { payload } = await jwtVerify(token, this.key, {
      algorithms: ['HS256'],
      issuer: 'magiclash-api',
      audience: 'magiclash-realtime',
      requiredClaims: ['exp', 'iat', 'jti', 'sub'],
      currentDate: new Date(now),
    });
    const c = payload as unknown as JoinClaims;
    const idOk = c.kind === 'user' ? UUID.test(c.sub) : c.kind === 'guest' && GUEST.test(c.sub);
    if (
      !idOk ||
      !NAME.test(c.name) ||
      !UUID.test(c.match) ||
      (c.mode !== 'ffa' && c.mode !== 'teams') ||
      !STAGES.has(c.stage) ||
      !(c.stocks >= 1 && c.stocks <= 5) ||
      !(c.max_players >= 2 && c.max_players <= 4) ||
      (c.avatar !== undefined && (c.kind !== 'user' || typeof c.avatar !== 'string' || !AVATAR.test(c.avatar)))
    ) {
      throw new Error('bad claims');
    }
    for (const [k, exp] of this.used) if (exp < now) this.used.delete(k);
    if (this.used.has(c.jti)) throw new Error('token already used');
    this.used.set(c.jti, c.exp * 1000 + 60_000);
    return c;
  }
}
