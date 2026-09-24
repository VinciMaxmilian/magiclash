import { describe, expect, it } from 'vitest';
import { Btn, Predictor, Simulation, compactReplacer, type InputFrame, type MatchConfig } from '../src';

const config: MatchConfig = {
  stageId: 'castle_courtyard',
  fighters: [
    { characterId: 'knight', team: 0, name: 'a' },
    { characterId: 'archer', team: 1, name: 'b' },
  ],
  stocks: 3,
  timeLimit: 0,
  seed: 77,
  countdownTicks: 0,
};

/** Wire copy: JSON with the same rounding the server applies. */
const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v, compactReplacer));

describe('client prediction + reconciliation', () => {
  it('after reconciling, the prediction equals what the server will compute from the same inputs', () => {
    const server = new Simulation(config);
    const client = new Simulation(config);
    const predictor = new Predictor(client, 0);
    const LAG = 5;
    const REMOTE = Btn.Right; // constant remote input → extrapolation is exact
    const script = (t: number): InputFrame => (t % 40 < 20 ? Btn.Right : t % 40 === 25 ? Btn.Light : t % 40 === 30 ? Btn.Jump : Btn.Left);
    const sent: InputFrame[] = [];
    let serverAck = -1;
    let checks = 0;

    for (let t = 0; t < 300; t++) {
      const input = script(t);
      sent.push(input);
      predictor.predict(t, input);

      // server applies our input with LAG ticks of delay (one per tick)
      if (t >= LAG) serverAck++;
      server.step([serverAck >= 0 ? sent[serverAck] : 0, REMOTE]);

      // a snapshot generated LAG ticks ago arrives now (we reconcile with the current server state + ack
      // to keep the test simple: what matters is state/ack consistency)
      if (t % 2 === 0 && serverAck >= 0) {
        predictor.reconcile(wire(server.state), serverAck);
        // Oracle: server state + our pending inputs, remote input unchanged.
        const oracle = new Simulation(config);
        oracle.state = wire(server.state);
        for (let s = serverAck + 1; s <= t; s++) oracle.step([sent[s], REMOTE]);
        const a = client.state.fighters[0];
        const b = oracle.state.fighters[0];
        expect(a.x).toBeCloseTo(b.x, 5);
        expect(a.y).toBeCloseTo(b.y, 5);
        expect(a.state).toBe(b.state);
        checks++;
      }
    }
    expect(checks).toBeGreaterThan(100);
  });

  it('local input shows up immediately (no round-trip delay)', () => {
    const client = new Simulation(config);
    const p = new Predictor(client, 0);
    const x0 = client.state.fighters[0].x;
    for (let s = 0; s < 10; s++) p.predict(s, Btn.Right);
    expect(client.state.fighters[0].x).toBeGreaterThan(x0 + 5);
    expect(p.pendingCount).toBe(10);
    p.reconcile(new Simulation(config).state, 9);
    expect(p.pendingCount).toBe(0);
  });

  it('caps the replay window', () => {
    const p = new Predictor(new Simulation(config), 0);
    for (let s = 0; s < 500; s++) p.predict(s, 0);
    expect(p.pendingCount).toBe(Predictor.MAX_PENDING);
  });
});
