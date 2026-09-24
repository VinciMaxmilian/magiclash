import { createServer, request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, TICK_SECONDS } from '@magiclash/shared';
import { JoinTokenVerifier } from './auth';
import type { ServerConfig } from './config';
import { log } from './log';
import { createReporter, type Reporter } from './report';
import { Room, type Conn } from './room';

const AUTH_TIMEOUT_MS = 5000;
const MAX_CONNECTIONS_PER_IP = 8;

export interface RealtimeServer {
  http: Server;
  rooms: Map<string, Room>;
  close(): Promise<void>;
}

/**
 * Each trusted proxy APPENDS the address it saw to X-Forwarded-For; entries to the left of those
 * come from the client and can be forged, so the per-IP connection limit never uses them.
 */
export const clientIp = (req: IncomingMessage, trustedHops: number): string => {
  const parts = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (trustedHops > 0 && parts.length > 0) return parts[Math.max(0, parts.length - trustedHops)];
  return req.socket.remoteAddress ?? '?';
};

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer']);
const PROXY_TIMEOUT_MS = 30_000;

const endToEnd = (h: IncomingHttpHeaders) =>
  Object.fromEntries(Object.entries(h).filter(([k, v]) => v !== undefined && !HOP_BY_HOP.has(k))) as Record<string, string | string[]>;

/**
 * Forwards one /api/ request to the FastAPI process in the same container. Headers pass through
 * unchanged — including X-Forwarded-For, so the API still sees the address appended by Render's
 * proxy (TRUSTED_PROXY_HOPS=1 stays correct). Bodies are streamed, never buffered here; the API
 * enforces its own size limits.
 */
const proxyToApi = (target: string, req: IncomingMessage, res: ServerResponse) => {
  const t = new URL(target);
  const upstream = httpRequest(
    { hostname: t.hostname, port: t.port, method: req.method, path: req.url, headers: endToEnd(req.headers), timeout: PROXY_TIMEOUT_MS },
    (r) => {
      res.writeHead(r.statusCode ?? 502, endToEnd(r.headers));
      r.pipe(res);
    },
  );
  upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{"error":"api_unavailable"}');
  });
  req.pipe(upstream);
};

export const startServer = (cfg: ServerConfig, reporter: Reporter = createReporter(cfg.apiUrl, cfg.gameServerSecret)): RealtimeServer => {
  const verifier = new JoinTokenVerifier(cfg.gameServerSecret);
  const rooms = new Map<string, Room>();
  const perIp = new Map<string, number>();

  const http = createServer((req, res) => {
    if (cfg.apiProxyTarget && req.url?.startsWith('/api/')) return proxyToApi(cfg.apiProxyTarget, req, res);
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, region: cfg.region }));
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({
    server: http,
    path: '/ws',
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 } },
    verifyClient: ({ origin, req }, done) => {
      // Browsers always send Origin; only listed origins may connect.
      const allowed = origin ? cfg.allowedOrigins.includes(origin) : !cfg.isProduction;
      const ip = clientIp(req, cfg.trustedProxyHops);
      if (!allowed) {
        log('AUTH_FAILURE', { reason: 'origin', origin: origin?.slice(0, 80) }, 'warn');
        return done(false, 403, 'Forbidden');
      }
      if ((perIp.get(ip) ?? 0) >= MAX_CONNECTIONS_PER_IP) {
        log('RATE_LIMIT', { reason: 'connections_per_ip' }, 'warn');
        return done(false, 429, 'Too Many Requests');
      }
      done(true);
    },
  });

  wss.on('connection', (ws: WebSocket, req) => {
    const ip = clientIp(req, cfg.trustedProxyHops);
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    const lag = cfg.simulatedLatencyMs;
    const conn: Conn = {
      id: randomUUID(),
      send: (data) => {
        const out = () => {
          if (ws.readyState === ws.OPEN) ws.send(data);
        };
        if (lag > 0) setTimeout(out, lag);
        else out();
      },
      close: (code, reason) => ws.close(code, reason),
    };
    let room: Room | null = null;
    const authTimer = setTimeout(() => {
      if (!room) ws.close(4401, 'auth timeout');
    }, AUTH_TIMEOUT_MS);

    ws.on('message', async (data, isBinary) => {
      if (lag > 0) await new Promise((r) => setTimeout(r, lag));
      if (isBinary) return ws.close(4400, 'binary not supported');
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return room ? room.handle(conn, null) : ws.close(4400, 'bad json');
      }
      if (room) return room.handle(conn, msg);

      // First message must authenticate. The token is never put in the URL (URLs get logged).
      const m = msg as { t?: string; token?: string; v?: number };
      if (m.t !== 'auth' || typeof m.token !== 'string') return ws.close(4401, 'auth required');
      if (m.v !== PROTOCOL_VERSION) {
        conn.send(JSON.stringify({ t: 'error', code: 'outdated_client' }));
        return ws.close(4426, 'upgrade required');
      }
      try {
        const claims = await verifier.verify(m.token);
        let r = rooms.get(claims.match);
        if (!r) {
          r = new Room(claims, reporter, Date.now, (closed) => rooms.delete(closed.matchId));
          rooms.set(claims.match, r);
        }
        r.join(conn, claims);
        room = r;
        clearTimeout(authTimer);
      } catch (e) {
        const code = e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : 'unauthorized';
        log('AUTH_FAILURE', { reason: code }, 'warn');
        conn.send(JSON.stringify({ t: 'error', code }));
        ws.close(4403, code);
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      perIp.set(ip, Math.max(0, (perIp.get(ip) ?? 1) - 1));
      if (perIp.get(ip) === 0) perIp.delete(ip);
      room?.disconnect(conn);
    });
    ws.on('error', () => ws.close());
  });

  // Fixed-step loop with drift correction: timers are imprecise, the accumulator is not.
  const stepMs = TICK_SECONDS * 1000;
  let last = performance.now();
  let acc = 0;
  const loop = setInterval(() => {
    const now = performance.now();
    acc += Math.min(now - last, 250);
    last = now;
    let steps = 0;
    while (acc >= stepMs && steps < 5) {
      for (const r of rooms.values()) r.tick();
      acc -= stepMs;
      steps++;
    }
  }, 4);

  // The WebSocketServer re-emits http errors; without a listener a busy port is an unhandled crash.
  wss.on('error', () => undefined);
  http.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      log('SERVER_ERROR', { reason: 'port_in_use', port: cfg.port, hint: `Porta ${cfg.port} ocupada: encerre o outro processo ou use PORT=<outra>` }, 'error');
      process.exitCode = 1;
      clearInterval(loop);
      return;
    }
    throw e;
  });
  http.listen(cfg.port, () =>
    log('SERVER_STARTED', { port: cfg.port, region: cfg.region, simulatedLatencyMs: cfg.simulatedLatencyMs || undefined }),
  );

  return {
    http,
    rooms,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(loop);
        for (const r of rooms.values()) r.close('shutdown');
        wss.close();
        http.close(() => resolve());
      }),
  };
};
