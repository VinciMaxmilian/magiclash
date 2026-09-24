import {
  CHARACTERS,
  COLORS,
  INPUT_REDUNDANCY,
  SNAPSHOT_EVERY_TICKS,
  Simulation,
  TICK_RATE,
  compactReplacer,
  sanitizeInput,
  type ColorId,
  type EndFighter,
  type LobbyPlayer,
  type MatchConfig,
  type ServerMsg,
  type SimEvent,
  type SlotInfo,
} from '@magiclash/shared';
import type { JoinClaims } from './auth';
import { log } from './log';
import type { MatchReport, Reporter } from './report';

/** Transport-agnostic connection (ws in production, fakes in tests). */
export interface Conn {
  readonly id: string;
  send(data: string): void;
  close(code: number, reason: string): void;
}

interface Member {
  slot: number;
  sub: string;
  kind: 'user' | 'guest';
  name: string;
  avatar: string | null;
  character: string;
  color: ColorId;
  team: number;
  ready: boolean;
  conn: Conn | null;
  queue: number[];
  lastSeq: number;
  lastInput: number;
  appliedSeq: number;
  disconnectedAt: number | null;
  strikes: number;
  windowStart: number;
  windowCount: number;
  fighter: number;
}

export type RoomState = 'lobby' | 'running' | 'ended' | 'closed';

const MAX_MSGS_PER_SECOND = 150;
const MAX_STRIKES = 20;
const FORFEIT_AFTER_MS = 15_000;
const LOBBY_TIMEOUT_MS = 5 * 60_000;
const MAX_QUEUE = 6;

const send = (m: Member, msg: ServerMsg | string) => {
  if (!m.conn) return;
  m.conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
};

/**
 * One match. Lobby → running (authoritative 60 Hz Simulation) → ended (signed report).
 * Accepts only lobby choices and button bits from clients; everything else is computed here.
 */
export class Room {
  readonly matchId: string;
  readonly code: string | null;
  readonly mode: 'ffa' | 'teams';
  readonly stage: string;
  readonly stocks: number;
  readonly maxPlayers: number;
  readonly ranked: boolean;
  state: RoomState = 'lobby';
  sim: Simulation | null = null;
  private members: Member[] = [];
  private order: Member[] = [];
  private pendingEvents: SimEvent[] = [];
  private readonly suspicious = new Set<string>();
  private readonly createdAt: number;

  constructor(
    base: JoinClaims,
    private readonly reporter: Reporter,
    private readonly clock: () => number = Date.now,
    private readonly onClosed: (room: Room) => void = () => undefined,
  ) {
    this.matchId = base.match;
    this.code = base.room;
    this.mode = base.mode;
    this.stage = base.stage;
    this.stocks = base.stocks;
    this.maxPlayers = base.max_players;
    this.ranked = base.ranked;
    this.createdAt = clock();
  }

  get playerCount(): number {
    return this.members.length;
  }

  /** Returns the slot, or throws an error code string. */
  join(conn: Conn, c: JoinClaims): number {
    if (this.state === 'closed' || this.state === 'ended') throw new Error('room_closed');
    if (c.match !== this.matchId) throw new Error('wrong_room');
    const existing = this.members.find((m) => m.sub === c.sub);
    if (existing) {
      // Reconnect: the old socket (if any) is replaced.
      existing.conn?.close(4001, 'replaced');
      existing.conn = conn;
      existing.disconnectedAt = null;
      this.welcome(existing);
      if (this.state === 'running') this.sendStart(existing);
      else this.broadcastLobby();
      log('PLAYER_REJOINED', { match: this.matchId, slot: existing.slot });
      return existing.slot;
    }
    if (this.state !== 'lobby') throw new Error('match_in_progress');
    if (this.members.length >= this.maxPlayers) throw new Error('room_full');
    const used = new Set(this.members.map((m) => m.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const usedColors = new Set(this.members.map((m) => m.color));
    const m: Member = {
      slot,
      sub: c.sub,
      kind: c.kind,
      name: c.name,
      avatar: c.avatar ?? null,
      character: 'knight',
      color: COLORS.find((col) => !usedColors.has(col)) ?? 'blue',
      team: slot % 2,
      ready: false,
      conn,
      queue: [],
      lastSeq: -1,
      lastInput: 0,
      appliedSeq: -1,
      disconnectedAt: null,
      strikes: 0,
      windowStart: this.clock(),
      windowCount: 0,
      fighter: -1,
    };
    this.members.push(m);
    log('PLAYER_JOINED', { match: this.matchId, slot, kind: c.kind });
    this.welcome(m);
    this.broadcastLobby();
    return slot;
  }

  private welcome(m: Member) {
    send(m, {
      t: 'welcome',
      slot: m.slot,
      match: this.matchId,
      room: this.code,
      mode: this.mode,
      stage: this.stage,
      stocks: this.stocks,
      maxPlayers: this.maxPlayers,
      ranked: this.ranked,
    });
  }

  private lobbyPlayers(): LobbyPlayer[] {
    return this.members
      .map((m) => ({
        slot: m.slot,
        name: m.name,
        avatar: m.avatar,
        kind: m.kind,
        character: m.character,
        color: m.color,
        team: m.team,
        ready: m.ready,
        connected: m.conn !== null,
      }))
      .sort((a, b) => a.slot - b.slot);
  }

  private broadcastLobby() {
    const host = this.members.length ? Math.min(...this.members.map((m) => m.slot)) : 0;
    const msg = JSON.stringify({ t: 'lobby', players: this.lobbyPlayers(), host } satisfies ServerMsg);
    this.members.forEach((m) => send(m, msg));
  }

  private strike(m: Member, reason: string) {
    m.strikes++;
    log('INVALID_ACTION', { match: this.matchId, slot: m.slot, reason }, 'warn');
    if (m.strikes >= MAX_STRIKES) {
      this.suspicious.add(`kicked:${reason}:slot${m.slot}`);
      m.conn?.close(4008, 'policy');
      this.disconnect(m.conn!);
    }
  }

  /** Every client message goes through here; anything unexpected is a strike. */
  handle(conn: Conn, raw: unknown): void {
    const m = this.members.find((x) => x.conn === conn);
    if (!m) return;
    const now = this.clock();
    if (now - m.windowStart >= 1000) {
      m.windowStart = now;
      m.windowCount = 0;
    }
    if (++m.windowCount > MAX_MSGS_PER_SECOND) {
      if (m.windowCount === MAX_MSGS_PER_SECOND + 1) {
        this.suspicious.add(`flood:slot${m.slot}`);
        this.strike(m, 'flood');
      }
      return;
    }
    if (typeof raw !== 'object' || raw === null) return this.strike(m, 'not_object');
    const msg = raw as Record<string, unknown>;
    switch (msg.t) {
      case 'in':
        return this.onInput(m, msg);
      case 'ping':
        if (typeof msg.id === 'number') send(m, { t: 'pong', id: msg.id, st: now });
        return;
      case 'pick': {
        if (this.state !== 'lobby') return;
        const character = msg.character;
        const color = msg.color;
        if (typeof character !== 'string' || !(character in CHARACTERS)) return this.strike(m, 'bad_character');
        if (!COLORS.includes(color as ColorId)) return this.strike(m, 'bad_color');
        m.character = character;
        m.color = color as ColorId;
        m.ready = false;
        this.broadcastLobby();
        return;
      }
      case 'team': {
        if (this.state !== 'lobby' || this.mode !== 'teams') return;
        if (msg.team !== 0 && msg.team !== 1) return this.strike(m, 'bad_team');
        m.team = msg.team;
        m.ready = false;
        this.broadcastLobby();
        return;
      }
      case 'ready':
        if (this.state !== 'lobby') return;
        if (typeof msg.ready !== 'boolean') return this.strike(m, 'bad_ready');
        m.ready = msg.ready;
        this.broadcastLobby();
        this.maybeStart();
        return;
      case 'leave':
        m.conn?.close(1000, 'left');
        this.disconnect(conn);
        return;
      default:
        return this.strike(m, 'unknown_type');
    }
  }

  private onInput(m: Member, msg: Record<string, unknown>) {
    if (this.state !== 'running') return;
    const s = msg.s;
    const inputs = msg.i;
    if (!Number.isInteger(s) || (s as number) < 0 || (s as number) > 2 ** 31) return this.strike(m, 'bad_seq');
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > INPUT_REDUNDANCY) return this.strike(m, 'bad_inputs');
    if ((s as number) > m.lastSeq + TICK_RATE * 5) {
      // A client can't legitimately be 5 s ahead: sequence skipping is an exploit attempt.
      this.suspicious.add(`seq_jump:slot${m.slot}`);
      return this.strike(m, 'seq_jump');
    }
    for (let k = inputs.length - 1; k >= 0; k--) {
      const seq = (s as number) - k;
      if (seq <= m.lastSeq) continue;
      m.queue.push(sanitizeInput(inputs[k]));
      m.lastSeq = seq;
    }
    if (m.queue.length > MAX_QUEUE * 4) {
      this.suspicious.add(`input_flood:slot${m.slot}`);
      m.queue.splice(0, m.queue.length - 2);
      this.strike(m, 'input_flood');
    }
  }

  disconnect(conn: Conn): void {
    const m = this.members.find((x) => x.conn === conn);
    if (!m) return;
    m.conn = null;
    if (this.state === 'lobby') {
      this.members = this.members.filter((x) => x !== m);
      log('PLAYER_LEFT', { match: this.matchId, slot: m.slot, phase: 'lobby' });
      if (this.members.length === 0) this.close('empty');
      else this.broadcastLobby();
      return;
    }
    m.disconnectedAt = this.clock();
    log('PLAYER_LEFT', { match: this.matchId, slot: m.slot, phase: this.state });
    if (this.state === 'running' && this.members.every((x) => x.conn === null)) this.close('abandoned');
  }

  private maybeStart() {
    const n = this.members.length;
    if (n < 2 || !this.members.every((m) => m.ready && m.conn)) return;
    if (this.maxPlayers === 2 && n !== 2) return;
    if (this.mode === 'teams') {
      if (n !== 4) return;
      const t0 = this.members.filter((m) => m.team === 0).length;
      if (t0 !== 2) return;
    }
    this.start();
  }

  private start() {
    this.order = [...this.members].sort((a, b) => a.slot - b.slot);
    this.order.forEach((m, i) => (m.fighter = i));
    const config: MatchConfig = {
      stageId: this.stage,
      fighters: this.order.map((m) => ({
        characterId: m.character,
        team: this.mode === 'teams' ? m.team : m.slot,
        name: m.name,
      })),
      stocks: this.stocks,
      timeLimit: this.order.length > 2 ? 300 : 240,
      seed: Math.floor(Math.random() * 0x7fffffff),
      countdownTicks: 3 * TICK_RATE,
    };
    this.sim = new Simulation(config);
    this.state = 'running';
    log('MATCH_STARTED', { match: this.matchId, players: this.order.length, stage: this.stage });
    this.order.forEach((m) => this.sendStart(m));
  }

  private slots(): SlotInfo[] {
    return this.order.map((m) => ({
      slot: m.slot,
      name: m.name,
      avatar: m.avatar,
      character: m.character,
      color: m.color,
      team: this.sim!.state.fighters[m.fighter].team,
    }));
  }

  private sendStart(m: Member) {
    if (!this.sim) return;
    send(m, { t: 'start', config: this.sim.config, slots: this.slots(), you: m.fighter });
  }

  /** One 60 Hz step. Called by the room manager's loop. */
  tick(): void {
    if (this.state === 'lobby') {
      if (this.clock() - this.createdAt > LOBBY_TIMEOUT_MS) this.close('lobby_timeout');
      return;
    }
    if (this.state !== 'running' || !this.sim) return;
    const sim = this.sim;
    const now = this.clock();

    const inputs = this.order.map((m) => {
      if (m.conn === null) {
        if (m.disconnectedAt !== null && now - m.disconnectedAt > FORFEIT_AFTER_MS) this.forfeit(m);
        return 0;
      }
      if (m.queue.length > MAX_QUEUE) m.queue.splice(0, m.queue.length - 2); // catch up after a lag spike
      const next = m.queue.shift();
      if (next !== undefined) {
        m.lastInput = next;
        m.appliedSeq++;
      }
      return m.lastInput;
    });
    this.pendingEvents.push(...sim.step(inputs));

    if (sim.state.tick % SNAPSHOT_EVERY_TICKS === 0 || sim.state.match.status === 'ended') this.broadcastSnapshot();
    if (sim.state.match.status === 'ended') void this.finish();
  }

  private forfeit(m: Member) {
    const f = this.sim!.state.fighters[m.fighter];
    if (f.stocks === 0) return;
    f.stocks = 0;
    f.state = 'dead';
    log('PLAYER_FORFEIT', { match: this.matchId, slot: m.slot });
  }

  private broadcastSnapshot() {
    const sim = this.sim!;
    const state = JSON.stringify(sim.state, compactReplacer);
    const ev = JSON.stringify(this.pendingEvents, compactReplacer);
    this.pendingEvents = [];
    for (const m of this.order) {
      if (!m.conn) continue;
      m.conn.send(`{"t":"snap","k":${sim.state.tick},"ack":${m.lastSeq - m.queue.length},"ev":${ev},"s":${state}}`);
    }
  }

  private async finish() {
    if (this.state !== 'running' || !this.sim) return;
    this.state = 'ended';
    const sim = this.sim;
    const winner = sim.state.match.winnerTeam ?? -1;
    const ranking = [...this.order].sort((a, b) => {
      const fa = sim.state.fighters[a.fighter];
      const fb = sim.state.fighters[b.fighter];
      const wa = fa.team === winner ? 1 : 0;
      const wb = fb.team === winner ? 1 : 0;
      return wb - wa || fb.stocks - fa.stocks || fa.damage - fb.damage;
    });
    const placement = new Map(ranking.map((m, i) => [m, sim.state.fighters[m.fighter].team === winner ? 1 : i + 1]));
    const report: MatchReport = {
      duration_ticks: sim.state.match.endTick,
      winner_team: winner,
      participants: this.order.map((m) => {
        const f = sim.state.fighters[m.fighter];
        return {
          slot: m.slot,
          kind: m.kind,
          id: m.sub,
          name: m.name,
          character_id: m.character,
          team: f.team,
          placement: placement.get(m) ?? this.order.length,
          kos: f.stats.kos,
          deaths: f.stats.falls,
          damage_dealt: Math.round(f.stats.damageDealt),
        };
      }),
      suspicious: [...this.suspicious].slice(0, 20),
    };
    log('MATCH_FINISHED', { match: this.matchId, winner, ticks: report.duration_ticks });
    const { recorded, ratings } = await this.reporter(this.matchId, report).catch(() => ({ recorded: false, ratings: [] }));
    const fighters: EndFighter[] = this.order.map((m) => {
      const f = sim.state.fighters[m.fighter];
      return { slot: m.slot, name: m.name, character: m.character, color: m.color, team: f.team, stats: f.stats, stocks: f.stocks };
    });
    const msg = JSON.stringify({ t: 'end', winnerTeam: winner, durationTicks: report.duration_ticks, fighters, recorded, ratings } satisfies ServerMsg);
    this.order.forEach((m) => send(m, msg));
    setTimeout(() => this.close('finished'), 20_000).unref?.();
  }

  close(reason: string): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    for (const m of this.members) m.conn?.close(1000, reason);
    log('ROOM_CLOSED', { match: this.matchId, reason });
    this.onClosed(this);
  }
}
