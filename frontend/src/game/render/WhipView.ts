import Phaser from 'phaser';
import { WHIP_SEGMENTS, whipPoints, type AttackDefinition, type FighterState } from '@magiclash/shared';
import { PAL } from './palette';
import { STYLES, whipHandleTip, type Pose } from './fighterSprite';

/**
 * Whip rope for the whip wielders.
 *
 * During a whip attack the rope IS the simulation's lash (shared `whipPoints`, the same curve
 * the hitboxes follow), interpolated between ticks — what you see is what hits. When the attack
 * ends the rope keeps that shape and velocity and becomes a verlet rope hanging from the sprite's
 * hand: it falls, swings, drags on the floor and is reeled back in. That part is cosmetic.
 */

const GRAVITY = 0.28;
const DAMPING = 0.955;
const ITERATIONS = 5;

interface Pt {
  x: number;
  y: number;
  px: number;
  py: number;
}

export class WhipView {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly chain: boolean;
  private readonly pts: Pt[] = [];
  private extend = 0;
  private acc = 0;
  private length = 40;
  /** Attack being drawn and its last frame (a lower frame = the same move started again). */
  private attackId = '';
  private lastFrame = 0;
  private cracked = false;

  constructor(
    scene: Phaser.Scene,
    private readonly characterId: string,
    private readonly onCrack: (x: number, y: number, heavy: boolean) => void,
  ) {
    this.chain = STYLES[characterId].weapon === 'chainwhip';
    this.gfx = scene.add.graphics().setDepth(10.5);
    for (let i = 0; i <= WHIP_SEGMENTS; i++) this.pts.push({ x: 0, y: 0, px: 0, py: 0 });
  }

  static wields(characterId: string): boolean {
    const w = STYLES[characterId]?.weapon;
    return w === 'whip' || w === 'chainwhip';
  }

  /**
   * `x, y` = the sprite's (interpolated) feet, `alpha` = interpolation between sim ticks,
   * `pose` = the frame on screen, `dt` in 60 Hz ticks.
   */
  update(
    f: FighterState,
    attack: AttackDefinition | undefined,
    x: number,
    y: number,
    alpha: number,
    pose: Pose | undefined,
    dt: number,
  ): void {
    if (f.state === 'dead') {
      this.extend = 0;
      this.gfx.clear();
      return;
    }
    const whip = f.state === 'attack' && f.attack && attack?.whip ? attack.whip : undefined;
    // The lash follows the simulation until its hitting window ends; then the rope is let go.
    const lashing = !!whip && !!attack && !!f.attack && f.attack.frame < attack.startup + attack.active;
    if (whip && attack && f.attack && lashing) {
      const fresh = attack.id !== this.attackId || f.attack.frame < this.lastFrame;
      this.attackId = attack.id;
      this.lastFrame = f.attack.frame;
      if (fresh) this.cracked = false;
      this.length = whip.length;
      this.extend = 1;
      const frame = f.attack.frame + (f.hitlag > 0 ? 0 : Math.min(0.999, alpha));
      const target = whipPoints(whip, attack, frame, f.attack.charge, x, y, f.facing);
      target.forEach((t, i) => {
        const p = this.pts[i];
        // Keep the previous position as verlet history: on release the rope carries this motion.
        p.px = fresh ? t.x : p.x;
        p.py = fresh ? t.y : p.y;
        p.x = t.x;
        p.y = t.y;
      });
      const tip = this.pts[WHIP_SEGMENTS];
      if (!this.cracked && f.attack.frame >= attack.startup && Math.hypot(tip.x - tip.px, tip.y - tip.py) > 7 * Math.max(0.5, dt)) {
        this.cracked = true;
        this.onCrack(tip.x, tip.y, whip.length > 60 || !!whip.spin);
      }
      this.acc = 0;
    } else {
      if (!whip) {
        this.attackId = '';
        this.lastFrame = 0;
      }
      if (this.extend <= 0) {
        this.gfx.clear();
        return;
      }
      // Reel in once the move is over (faster when hit); during its recovery the rope just falls.
      if (!whip) this.extend = Math.max(0, this.extend - (f.state === 'hitstun' ? 0.25 : 0.07) * dt);
      const handle = pose ? whipHandleTip(pose, STYLES[this.characterId]) : ([10, -24] as [number, number]);
      const ax = x + f.facing * handle[0];
      const ay = y + handle[1];
      this.acc += dt;
      let steps = 0;
      while (this.acc >= 1 && steps < 4) {
        this.step(ax, ay, f.grounded ? y : null);
        this.acc -= 1;
        steps++;
      }
      if (steps === 4) this.acc = 0;
      if (this.extend <= 0) {
        this.gfx.clear();
        return;
      }
    }
    this.draw();
  }

  private segments(): number {
    return Math.max(1, Math.min(WHIP_SEGMENTS, Math.round(WHIP_SEGMENTS * Math.max(0.15, this.extend))));
  }

  /** Free rope step. `floor` = ground under a grounded fighter: the rope drags on it. */
  private step(ax: number, ay: number, floor: number | null) {
    const n = this.segments();
    const rest = (this.length / WHIP_SEGMENTS) * Math.max(0.15, this.extend);
    for (let i = 1; i <= n; i++) {
      const p = this.pts[i];
      const vx = (p.x - p.px) * DAMPING;
      const vy = (p.y - p.py) * DAMPING;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + GRAVITY;
    }
    for (let it = 0; it < ITERATIONS; it++) {
      this.pts[0].x = ax;
      this.pts[0].y = ay;
      for (let i = 0; i < n; i++) {
        const a = this.pts[i];
        const b = this.pts[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const diff = (dist - rest) / dist;
        if (i === 0) {
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
    }
    if (floor !== null) {
      for (let i = 1; i <= n; i++) {
        const p = this.pts[i];
        if (p.y > floor - 1) {
          p.y = floor - 1;
          p.px += (p.x - p.px) * 0.4; // ground friction
        }
      }
    }
    for (let i = n + 1; i <= WHIP_SEGMENTS; i++) Object.assign(this.pts[i], { x: this.pts[n].x, y: this.pts[n].y, px: this.pts[n].x, py: this.pts[n].y });
    this.pts[0].px = this.pts[0].x = ax;
    this.pts[0].py = this.pts[0].y = ay;
  }

  /** Crisp pixel rope: 1px ink outline, links (chain) or a tapering leather lash. */
  private draw() {
    const g = this.gfx;
    g.clear();
    const n = this.segments();
    const px: { x: number; y: number; t: number }[] = [];
    const seen = new Set<number>();
    let along = 0;
    let total = 0;
    for (let i = 0; i < n; i++) total += Math.hypot(this.pts[i + 1].x - this.pts[i].x, this.pts[i + 1].y - this.pts[i].y);
    for (let i = 0; i < n; i++) {
      const a = this.pts[i];
      const b = this.pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len));
      for (let s = 0; s < steps; s++) {
        const k = s / steps;
        const x = Math.round(a.x + (b.x - a.x) * k);
        const y = Math.round(a.y + (b.y - a.y) * k);
        const key = x * 4096 + y;
        if (!seen.has(key)) {
          seen.add(key);
          px.push({ x, y, t: total > 0 ? (along + len * k) / total : 0 });
        }
      }
      along += len;
    }
    const chain = this.chain;
    g.fillStyle(PAL.ink, 1);
    for (const p of px) g.fillRect(p.x - 1, p.y - 1, 3, p.t < 0.35 && chain ? 4 : 3);
    const S = PAL.steel;
    const L = PAL.leather;
    px.forEach((p, i) => {
      let c: number;
      if (chain) c = Math.floor(i / 2) % 2 === 0 ? S[3] : S[1];
      else c = p.t < 0.3 ? L[1] : p.t < 0.8 ? L[2] : L[3];
      g.fillStyle(c, 1);
      g.fillRect(p.x, p.y, 1, 1);
      if (chain && p.t < 0.35) {
        g.fillStyle(Math.floor(i / 2) % 2 === 0 ? S[2] : S[0], 1);
        g.fillRect(p.x, p.y + 1, 1, 1);
      } else if (!chain && p.t < 0.3) {
        g.fillStyle(L[0], 1);
        g.fillRect(p.x, p.y + 1, 1, 1);
      }
      if (chain && i % 4 === 0) {
        g.fillStyle(S[4], 1);
        g.fillRect(p.x, p.y, 1, 1);
      }
    });
  }

  destroy(): void {
    this.gfx.destroy();
  }
}

