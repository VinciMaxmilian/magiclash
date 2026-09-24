import { INPUT_REDUNDANCY, PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from '@magiclash/shared';
import { ApiError } from '../../services/account';

type Handler<T extends ServerMsg['t']> = (msg: Extract<ServerMsg, { t: T }>) => void;

/**
 * WebSocket connection to the realtime server. Sends only lobby choices and input bits.
 * Authenticates with the first message (token never in the URL).
 */
export class NetClient {
  private handlers = new Map<string, Set<(m: ServerMsg) => void>>();
  /** Last message of each state-like type, replayed to late subscribers (scene switches). */
  private latest = new Map<string, ServerMsg>();
  private closeHandlers = new Set<(code: number) => void>();
  private pingTimer: number | undefined;
  private pingSent = new Map<number, number>();
  private nextPing = 1;
  private inputSeq = 0;
  private recent: number[] = [];
  rtt = 0;
  welcome!: Extract<ServerMsg, { t: 'welcome' }>;

  private constructor(private readonly ws: WebSocket) {}

  static connect(url: string, token: string, timeoutMs = 8000): Promise<NetClient> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        return reject(new ApiError(0, 'realtime_offline'));
      }
      const client = new NetClient(ws);
      const timer = window.setTimeout(() => {
        ws.close();
        reject(new ApiError(0, 'realtime_offline'));
      }, timeoutMs);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token, v: PROTOCOL_VERSION } satisfies ClientMsg));
      ws.onmessage = (e) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (msg.t === 'welcome' && !client.welcome) {
          client.welcome = msg;
          window.clearTimeout(timer);
          client.startPing();
          resolve(client);
        } else if (msg.t === 'error' && !client.welcome) {
          window.clearTimeout(timer);
          reject(new ApiError(0, msg.code));
        }
        if (msg.t === 'pong') client.onPong(msg);
        if (msg.t === 'lobby' || msg.t === 'start' || msg.t === 'end') client.latest.set(msg.t, msg);
        client.handlers.get(msg.t)?.forEach((h) => h(msg));
      };
      ws.onclose = (e) => {
        window.clearTimeout(timer);
        window.clearInterval(client.pingTimer);
        if (!client.welcome) reject(new ApiError(0, 'realtime_offline'));
        client.closeHandlers.forEach((h) => h(e.code));
      };
    });
  }

  on<T extends ServerMsg['t']>(t: T, fn: Handler<T>): () => void {
    const set = this.handlers.get(t) ?? new Set();
    set.add(fn as (m: ServerMsg) => void);
    this.handlers.set(t, set);
    const last = this.latest.get(t);
    if (last) queueMicrotask(() => set.has(fn as (m: ServerMsg) => void) && (fn as (m: ServerMsg) => void)(last));
    return () => set.delete(fn as (m: ServerMsg) => void);
  }

  onClose(fn: (code: number) => void): () => void {
    this.closeHandlers.add(fn);
    return () => this.closeHandlers.delete(fn);
  }

  send(msg: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** One input per simulation tick; each message repeats the last few for loss resilience. */
  sendInput(frame: number): number {
    const seq = this.inputSeq++;
    this.recent.unshift(frame);
    if (this.recent.length > INPUT_REDUNDANCY) this.recent.length = INPUT_REDUNDANCY;
    this.send({ t: 'in', s: seq, i: this.recent });
    return seq;
  }

  private startPing() {
    this.pingTimer = window.setInterval(() => {
      const id = this.nextPing++;
      this.pingSent.set(id, performance.now());
      this.send({ t: 'ping', id });
    }, 2000);
  }

  private onPong(msg: Extract<ServerMsg, { t: 'pong' }>) {
    const t0 = this.pingSent.get(msg.id);
    if (t0 === undefined) return;
    this.pingSent.delete(msg.id);
    const sample = performance.now() - t0;
    this.rtt = this.rtt ? this.rtt * 0.8 + sample * 0.2 : sample;
  }

  get open(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  close(): void {
    window.clearInterval(this.pingTimer);
    this.send({ t: 'leave' });
    this.ws.close(1000, 'bye');
  }
}
