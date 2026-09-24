import type { InputFrame } from '../core/input';
import type { Simulation } from '../sim/simulation';
import type { SimEvent, SimState } from '../sim/types';

interface Pending {
  seq: number;
  input: InputFrame;
}

/**
 * Client-side prediction + server reconciliation.
 *
 * - Every local input is applied immediately to a local Simulation (no input delay).
 * - When an authoritative snapshot arrives (state at the server's tick, `ack` = last input
 *   sequence of ours the server applied), the local state is replaced by the snapshot and
 *   the still-unacknowledged inputs are re-simulated on top of it.
 * - Remote fighters are extrapolated with their last known input (`prevInput` from the
 *   snapshot) — the same assumption rollback netcode makes.
 *
 * The server stays authoritative: prediction only changes what THIS client sees early.
 */
export class Predictor {
  private pending: Pending[] = [];
  /** Hard cap: never re-simulate more than ~1 s (a stalled connection shouldn't freeze the tab). */
  static readonly MAX_PENDING = 60;

  constructor(
    private readonly sim: Simulation,
    private readonly me: number,
  ) {}

  private inputsFor(mine: InputFrame): InputFrame[] {
    return this.sim.state.fighters.map((f, i) => (i === this.me ? mine : f.prevInput));
  }

  /** Apply one local input now. Returns the predicted events (use for instant local feedback only). */
  predict(seq: number, input: InputFrame): SimEvent[] {
    this.pending.push({ seq, input });
    if (this.pending.length > Predictor.MAX_PENDING) this.pending.shift();
    return this.sim.step(this.inputsFor(input));
  }

  /** Rebase on the authoritative state and replay unacknowledged inputs. */
  reconcile(state: SimState, ack: number): void {
    this.pending = this.pending.filter((p) => p.seq > ack);
    this.sim.state = state;
    for (const p of this.pending) this.sim.step(this.inputsFor(p.input));
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}
