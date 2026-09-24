/** Structured JSON logs (MATCH_STARTED, PLAYER_JOINED, INVALID_ACTION, ...). Never log tokens. */
export const log = (event: string, data: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'info'): void => {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};
