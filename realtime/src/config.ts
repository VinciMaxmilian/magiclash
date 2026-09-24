export interface ServerConfig {
  port: number;
  gameServerSecret: string;
  /** Backend base URL for signed result reports. */
  apiUrl: string;
  /** Exact browser origins allowed to open a WebSocket. Empty = allow none (except no-origin tools in dev). */
  allowedOrigins: string[];
  region: string;
  isProduction: boolean;
  /** Proxies in front of the server that append to X-Forwarded-For (Render: 1). */
  trustedProxyHops: number;
  /**
   * Single-container deploy: HTTP requests under /api/ are forwarded to the FastAPI process at
   * this address (loopback only). Null = no proxy (local dev, separate services).
   */
  apiProxyTarget: string | null;
  /** DEV ONLY: artificial one-way delay (ms) on every message, to test netcode locally. */
  simulatedLatencyMs: number;
}

/** Only plain http to loopback: the API must never be reachable except through this process. */
const parseProxyTarget = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const u = new URL(raw);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) {
    throw new Error('API_PROXY_TARGET must be http://127.0.0.1:<port>');
  }
  return u.origin;
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): ServerConfig => {
  const secret = env.GAME_SERVER_SECRET ?? '';
  if (secret.length < 32) throw new Error('GAME_SERVER_SECRET missing or too short (>= 32 chars)');
  return {
    port: Number(env.PORT ?? 8787),
    gameServerSecret: secret,
    apiUrl: (env.API_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
    // Same normalisation as the API: quotes, spaces and a trailing slash are paste mistakes.
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, ''))
      .filter(Boolean),
    region: env.REGION ?? 'local',
    trustedProxyHops: Math.max(0, Math.min(5, Number(env.TRUSTED_PROXY_HOPS ?? 1))),
    apiProxyTarget: parseProxyTarget(env.API_PROXY_TARGET),
    isProduction: env.NODE_ENV === 'production',
    // Never honoured in production.
    simulatedLatencyMs: env.NODE_ENV === 'production' ? 0 : Math.max(0, Math.min(500, Number(env.SIMULATED_LATENCY_MS ?? 0))),
  };
};
