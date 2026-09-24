export interface ServerConfig {
  port: number;
  gameServerSecret: string;
  /** Backend base URL for signed result reports. */
  apiUrl: string;
  /** Exact browser origins allowed to open a WebSocket. Empty = allow none (except no-origin tools in dev). */
  allowedOrigins: string[];
  region: string;
  isProduction: boolean;
  /** DEV ONLY: artificial one-way delay (ms) on every message, to test netcode locally. */
  simulatedLatencyMs: number;
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): ServerConfig => {
  const secret = env.GAME_SERVER_SECRET ?? '';
  if (secret.length < 32) throw new Error('GAME_SERVER_SECRET missing or too short (>= 32 chars)');
  return {
    port: Number(env.PORT ?? 8787),
    gameServerSecret: secret,
    apiUrl: (env.API_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    region: env.FLY_REGION ?? env.REGION ?? 'local',
    isProduction: env.NODE_ENV === 'production',
    // Never honoured in production.
    simulatedLatencyMs: env.NODE_ENV === 'production' ? 0 : Math.max(0, Math.min(500, Number(env.SIMULATED_LATENCY_MS ?? 0))),
  };
};
