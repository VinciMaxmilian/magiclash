import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { WebSocket } from 'ws';
import { BotController, Btn, type ServerMsg } from '@magiclash/shared';
import { JoinTokenVerifier, type JoinClaims } from '../src/auth';
import { Room, type Conn } from '../src/room';
import { createHmac } from 'node:crypto';
import { createReporter, type MatchReport } from '../src/report';
import { clientIp, startServer } from '../src/server';

const SECRET = 'realtime-test-secret-0123456789-abcdef';
const MATCH = '44444444-4444-4444-4444-444444444444';
const USER_A = '11111111-1111-1111-1111-111111111111';

const token = async (claims: Partial<JoinClaims> = {}, opts: { secret?: string; expSec?: number; alg?: string } = {}) =>
  new SignJWT({
    kind: 'user',
    name: 'alice',
    match: MATCH,
    room: 'ABCDEF',
    mode: 'ffa',
    stage: 'castle_courtyard',
    stocks: 1,
    max_players: 2,
    ranked: false,
    ...claims,
  } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: opts.alg ?? 'HS256' })
    .setSubject(claims.sub ?? USER_A)
    .setIssuer('magiclash-api')
    .setAudience('magiclash-realtime')
    .setIssuedAt()
    .setJti(claims.jti ?? crypto.randomUUID().replace(/-/g, ''))
    .setExpirationTime(Math.floor(Date.now() / 1000) + (opts.expSec ?? 120))
    .sign(new TextEncoder().encode(opts.secret ?? SECRET));

const claimsFor = (sub: string, name: string, extra: Partial<JoinClaims> = {}): JoinClaims => ({
  sub,
  kind: sub.startsWith('g_') ? 'guest' : 'user',
  name,
  match: MATCH,
  room: 'ABCDEF',
  mode: 'ffa',
  stage: 'castle_courtyard',
  stocks: 1,
  max_players: 2,
  ranked: false,
  jti: crypto.randomUUID(),
  exp: Math.floor(Date.now() / 1000) + 120,
  ...extra,
});

class FakeConn implements Conn {
  readonly id = crypto.randomUUID();
  sent: ServerMsg[] = [];
  closed: [number, string] | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code: number, reason: string) {
    this.closed = [code, reason];
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return [...this.sent].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

const OK = { recorded: true, ratings: [] };

const twoPlayerRoom = (reporter = vi.fn(async () => OK)) => {
  let now = 0;
  const room = new Room(claimsFor(USER_A, 'alice'), reporter, () => now);
  const a = new FakeConn();
  const b = new FakeConn();
  room.join(a, claimsFor(USER_A, 'alice'));
  room.join(b, claimsFor('g_0123456789abcdef', 'Visitor1'));
  return { room, a, b, reporter, advance: (ms: number) => (now += ms) };
};

describe('join tokens', () => {
  it('accepts a valid token once', async () => {
    const v = new JoinTokenVerifier(SECRET);
    const t = await token();
    const c = await v.verify(t);
    expect(c.sub).toBe(USER_A);
    await expect(v.verify(t)).rejects.toThrow(/already used/);
  });

  it.each([
    ['wrong secret', () => token({}, { secret: 'x'.repeat(40) })],
    ['expired', () => token({}, { expSec: -10 })],
    ['bad name', () => token({ name: '<script>' })],
    ['bad stage', () => token({ stage: 'moon' })],
    ['bad player count', () => token({ max_players: 9 })],
    ['guest id shape', () => token({ kind: 'guest', sub: 'admin' })],
    ['avatar url instead of path', () => token({ avatar: 'https://evil.test/x.webp' })],
    ['avatar on a guest', () => token({ kind: 'guest', sub: 'g_0123456789abcdef', avatar: `${USER_A}/${'ab'.repeat(16)}.webp` })],
  ])('rejects %s', async (_label, make) => {
    await expect(new JoinTokenVerifier(SECRET).verify(await make())).rejects.toThrow();
  });

  it('rejects alg none', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: USER_A, exp: Date.now() / 1000 + 60 })).toString('base64url');
    await expect(new JoinTokenVerifier(SECRET).verify(`${header}.${body}.`)).rejects.toThrow();
  });
});

describe('lobby', () => {
  it('assigns slots, broadcasts lobby, starts when everyone is ready', () => {
    const { room, a, b } = twoPlayerRoom();
    expect(a.last('welcome')?.slot).toBe(0);
    expect(b.last('welcome')?.slot).toBe(1);
    room.handle(a, { t: 'pick', character: 'archer', color: 'green' });
    room.handle(a, { t: 'ready', ready: true });
    expect(room.state).toBe('lobby');
    room.handle(b, { t: 'ready', ready: true });
    expect(room.state).toBe('running');
    const start = a.last('start')!;
    expect(start.config.fighters[0].characterId).toBe('archer');
    expect(start.slots[0].color).toBe('green');
  });

  it('relays the verified avatar path to everyone', async () => {
    const avatar = `${USER_A}/${'ab'.repeat(16)}.webp`;
    const claims = await new JoinTokenVerifier(SECRET).verify(await token({ avatar }));
    const room = new Room(claims, vi.fn(async () => OK));
    const a = new FakeConn();
    const b = new FakeConn();
    room.join(a, claims);
    room.join(b, claimsFor('g_0123456789abcdef', 'Visitor1'));
    expect(b.last('lobby')?.players.map((p) => p.avatar)).toEqual([avatar, null]);
    room.handle(a, { t: 'ready', ready: true });
    room.handle(b, { t: 'ready', ready: true });
    expect(b.last('start')?.slots[0].avatar).toBe(avatar);
  });

  it('rejects a third player and unknown characters/colors', () => {
    const { room, a } = twoPlayerRoom();
    expect(() => room.join(new FakeConn(), claimsFor('22222222-2222-2222-2222-222222222222', 'carol'))).toThrow('room_full');
    room.handle(a, { t: 'pick', character: 'dragon', color: 'blue' });
    room.handle(a, { t: 'pick', character: 'knight', color: 'purple' });
    expect(a.last('lobby')?.players[0].character).toBe('knight');
  });

  it('closes after too many invalid messages (strikes)', () => {
    const { room, a } = twoPlayerRoom();
    for (let i = 0; i < 25; i++) room.handle(a, { t: 'hack', payload: i });
    expect(a.closed?.[0]).toBe(4008);
    expect(room.playerCount).toBe(1);
  });
});

describe('match', () => {
  const started = () => {
    const r = twoPlayerRoom();
    r.room.handle(r.a, { t: 'ready', ready: true });
    r.room.handle(r.b, { t: 'ready', ready: true });
    return r;
  };

  it('applies queued inputs in order and sends snapshots with acks', () => {
    const { room, a } = started();
    for (let i = 0; i < 180; i++) room.tick(); // countdown
    room.handle(a, { t: 'in', s: 0, i: [Btn.Right] });
    room.handle(a, { t: 'in', s: 2, i: [Btn.Right, Btn.Right, Btn.Right] }); // redundancy fills seq 1
    const x0 = room.sim!.state.fighters[0].x;
    for (let i = 0; i < 4; i++) room.tick();
    expect(room.sim!.state.fighters[0].x).toBeGreaterThan(x0);
    const snap = a.last('snap')!;
    expect(snap.ack).toBe(2);
    expect(snap.s.fighters).toHaveLength(2);
  });

  it('ignores garbage inputs and flags sequence jumps', () => {
    const { room, a } = started();
    for (let i = 0; i < 180; i++) room.tick();
    room.handle(a, { t: 'in', s: 0, i: [999999] });
    room.handle(a, { t: 'in', s: 1, i: 'x' });
    room.handle(a, { t: 'in', s: 10_000_000, i: [0] });
    room.tick();
    expect(room.sim!.state.fighters[0].state).not.toBe('attack');
  });

  it('a whole match between bot-driven clients ends with a consistent signed report', async () => {
    const reporter = vi.fn(async (_id: string, _r: MatchReport) => ({ recorded: true, ratings: [{ slot: 0, before: 1000, after: 1016 }] }));
    const r = twoPlayerRoom(reporter);
    r.room.handle(r.a, { t: 'pick', character: 'knight', color: 'blue' });
    r.room.handle(r.b, { t: 'pick', character: 'barbarian', color: 'red' });
    r.room.handle(r.a, { t: 'ready', ready: true });
    r.room.handle(r.b, { t: 'ready', ready: true });
    const sim = r.room.sim!;
    const bots = [new BotController(sim, 0, 'hard', 1), new BotController(sim, 1, 'hard', 2)];
    const seq = [0, 0];
    for (let t = 0; t < 60 * 240 && r.room.state === 'running'; t++) {
      [r.a, r.b].forEach((conn, i) => {
        r.room.handle(conn, { t: 'in', s: seq[i]++, i: [bots[i].think(sim)] });
      });
      r.advance(1000 / 60);
      r.room.tick();
    }
    await vi.waitFor(() => expect(reporter).toHaveBeenCalled());
    const [matchId, report] = reporter.mock.calls[0];
    expect(matchId).toBe(MATCH);
    const kos = report.participants.reduce((a, p) => a + p.kos, 0);
    const deaths = report.participants.reduce((a, p) => a + p.deaths, 0);
    expect(kos).toBeLessThanOrEqual(deaths);
    expect(report.participants.map((p) => p.id)).toEqual([USER_A, 'g_0123456789abcdef']);
    await vi.waitFor(() => expect(r.a.last('end')?.recorded).toBe(true));
    expect(r.b.last('end')?.ratings).toEqual([{ slot: 0, before: 1000, after: 1016 }]);
  });

  it('reconnects a dropped player and forfeits one who never returns', () => {
    const { room, a, b, advance } = started();
    room.disconnect(b);
    const b2 = new FakeConn();
    room.join(b2, claimsFor('g_0123456789abcdef', 'Visitor1'));
    expect(b2.last('start')?.you).toBe(1);
    room.disconnect(b2);
    advance(16_000);
    for (let i = 0; i < 200; i++) room.tick();
    expect(room.sim!.state.fighters[1].stocks).toBe(0);
    expect(room.sim!.state.match.status).toBe('ended');
    expect(a.closed).toBeNull();
  });

  it('new players cannot join a running match', () => {
    const { room } = started();
    expect(() => room.join(new FakeConn(), claimsFor('33333333-3333-3333-3333-333333333333', 'eve'))).toThrow('match_in_progress');
  });
});

describe('websocket server', () => {
  it('authenticates via first message, rejects bad origins and reused tokens', async () => {
    const port = 18787 + Math.floor(Math.random() * 1000);
    const server = startServer(
      { port, gameServerSecret: SECRET, apiUrl: 'http://127.0.0.1:1', allowedOrigins: ['http://game.test'], region: 'test', isProduction: true, simulatedLatencyMs: 0, trustedProxyHops: 1 },
      async () => OK,
    );
    const url = `ws://127.0.0.1:${port}/ws`;
    const open = (origin?: string) =>
      new Promise<{ ws: WebSocket; msgs: ServerMsg[]; closed: Promise<number> }>((resolve, reject) => {
        const ws = new WebSocket(url, origin ? { origin } : {});
        const msgs: ServerMsg[] = [];
        const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
        ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
        ws.on('open', () => resolve({ ws, msgs, closed }));
        ws.on('unexpected-response', (_req, res) => reject(new Error(`http ${res.statusCode}`)));
        ws.on('error', () => undefined);
      });
    try {
      await expect(open('http://evil.test')).rejects.toThrow('http 403');
      await expect(open()).rejects.toThrow('http 403'); // production: Origin required

      const t = await token();
      const c1 = await open('http://game.test');
      c1.ws.send(JSON.stringify({ t: 'auth', token: t, v: 1 }));
      await vi.waitFor(() => expect(c1.msgs.some((m) => m.t === 'welcome')).toBe(true));

      const c2 = await open('http://game.test');
      c2.ws.send(JSON.stringify({ t: 'auth', token: t, v: 1 })); // same jti
      expect(await c2.closed).toBe(4403);

      const c3 = await open('http://game.test');
      c3.ws.send(JSON.stringify({ t: 'ready', ready: true })); // no auth first
      expect(await c3.closed).toBe(4401);
      c1.ws.close();
    } finally {
      await server.close();
    }
  });
});

describe('result reporter', () => {
  it('signs the body and relays only well-formed rating changes', async () => {
    const calls: { headers: Record<string, string>; body: string }[] = [];
    const fetchImpl = (async (_url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push(init);
      return new Response(JSON.stringify({ status: 'recorded', rated: true, ratings: [{ slot: 1, before: 990, after: 1006, user_id: 'x' }, { slot: 'x' }] }));
    }) as unknown as typeof fetch;
    const out = await createReporter('http://api.test', SECRET, fetchImpl)(MATCH, { duration_ticks: 900, winner_team: 1, participants: [], suspicious: [] });
    expect(out).toEqual({ recorded: true, ratings: [{ slot: 1, before: 990, after: 1006 }] });
    const { headers, body } = calls[0];
    expect(headers['X-Signature']).toBe(createHmac('sha256', SECRET).update(`${headers['X-Timestamp']}.${body}`).digest('hex'));
  });

  it('a rejected result is reported as not recorded', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 422 })) as unknown as typeof fetch;
    const out = await createReporter('http://api.test', SECRET, fetchImpl)(MATCH, { duration_ticks: 1, winner_team: 0, participants: [], suspicious: [] });
    expect(out).toEqual({ recorded: false, ratings: [] });
  });
});

describe('client ip behind a proxy', () => {
  const req = (xff: string | undefined, remote = '10.0.0.1') =>
    ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: remote } }) as never;

  it('uses the address appended by the trusted proxy, not what the client sent', () => {
    expect(clientIp(req('6.6.6.6, 203.0.113.9'), 1)).toBe('203.0.113.9');
    expect(clientIp(req('203.0.113.9'), 1)).toBe('203.0.113.9');
    expect(clientIp(req(undefined), 1)).toBe('10.0.0.1');
    expect(clientIp(req('6.6.6.6'), 0)).toBe('10.0.0.1');
  });
});
