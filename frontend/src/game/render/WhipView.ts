import Phaser from 'phaser';
import type { AttackDefinition, FighterState } from '@magiclash/shared';
import { PAL } from './palette';
import { STYLES, whipHandleTip, type Pose } from './fighterSprite';

/**
 * Whip rope with verlet physics (purely cosmetic: hitboxes live in the attack data).
 *
 * The rope hangs from the handle tip of the current sprite frame. During a whip attack every
 * point is pulled toward a "guide" line whose angle sweeps from the wind-up to the strike; the
 * pull is strong near the hand and weak at the tip, so the tip lags behind, the wave travels
 * down the rope and overshoots at the end (the crack). Spins and the heavy's charge whirl the
 * guide around the hand. When the attack ends the guide lets go: the rope falls, swings and is
 * reeled back in.
 */

export interface WhipSpec {
  /** Rope length (px) for normal lashes and for the heavy crack. */
  reach: number;
  heavy: number;
  chain: boolean;
}

export const WHIPS: Record<string, WhipSpec> = {
  hunter: { reach: 56, heavy: 66, chain: true },
  brawler: { reach: 44, heavy: 50, chain: false },
};

/** Guide angles (degrees, facing right, screen space: 0 = forward, -90 = up, 90 = down). */
interface Motion {
  wind: number;
  strike: number;
  spin?: boolean;
  heavy?: boolean;
}

const MOTIONS: Record<string, Motion> = {
  whip_side: { wind: -150, strike: 0 },
  whip_heavy: { wind: -170, strike: -4, heavy: true },
  whip_up: { wind: 150, strike: -52 },
  whip_low: { wind: -135, strike: 10 },
  whip_air_up: { wind: 80, strike: -86 },
  whip_air_down: { wind: -110, strike: 44 },
  whip_spin: { wind: -90, strike: 0, spin: true },
};

const SEG = 4; // px per rope segment
const GRAVITY = 0.28;
const DAMPING = 0.955;
const ITERATIONS = 5;
const DEG = Math.PI / 180;
/** Spins flatten the circle vertically so the lash reads as whirling around the body. */
const SPIN_FLATTEN = 0.4;

interface Pt {
  x: number;
  y: number;
  px: number;
  py: number;
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class WhipView {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly spec: WhipSpec;
  private readonly pts: Pt[] = [];
  private extend = 0;
  private acc = 0;
  /** Attack being drawn and its last frame (a lower frame = the same move started again). */
  private attackId = '';
  private lastFrame = 0;
  private spinning = false;
  private cracked = false;
  /** Guide state for the current tick. */
  private guideAngle = 0;
  private guideK = 0;
  private spinPhase = 0;
  private length = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly characterId: string,
    private readonly onCrack: (x: number, y: number, heavy: boolean) => void,
  ) {
    this.spec = WHIPS[characterId];
    this.gfx = scene.add.graphics().setDepth(10.5);
    const n = Math.ceil(this.spec.heavy / SEG) + 1;
    for (let i = 0; i < n; i++) this.pts.push({ x: 0, y: 0, px: 0, py: 0 });
  }

  static wields(characterId: string): boolean {
    const w = STYLES[characterId]?.weapon;
    return (w === 'whip' || w === 'chainwhip') && !!WHIPS[characterId];
  }

  /**
   * `x, y` = the sprite's (interpolated) feet position, `pose` = the frame being shown.
   * `dt` in 60 Hz ticks.
   */
  update(f: FighterState, attack: AttackDefinition | undefined, x: number, y: number, pose: Pose | undefined, dt: number): void {
    const facing = f.facing;
    const tip = pose ? whipHandleTip(pose, STYLES[this.characterId]) : ([10, -24] as [number, number]);
    const ax = x + facing * tip[0];
    const ay = y + tip[1];

    const motion = attack && f.attack && f.state === 'attack' ? MOTIONS[attack.effect] : undefined;
    if (motion && attack && f.attack) {
      if (attack.id !== this.attackId || f.attack.frame < this.lastFrame) {
        // New lash: the rope unfurls from the hand.
        for (const p of this.pts) Object.assign(p, { x: ax, y: ay, px: ax, py: ay });
        this.cracked = false;
        this.spinPhase = 0;
      }
      this.attackId = attack.id;
      this.lastFrame = f.attack.frame;
      this.spinning = !!motion.spin;
      this.length = motion.heavy ? this.spec.heavy : this.spec.reach;
      this.extend = 1;
      this.plan(motion, attack, f);
    } else {
      this.attackId = '';
      this.lastFrame = 0;
      this.spinning = false;
      this.guideK = 0;
      // Reel in (faster when hit or dead).
      this.extend = Math.max(0, this.extend - (f.state === 'hitstun' || f.state === 'dead' ? 0.25 : 0.07) * dt);
    }

    if (this.extend <= 0 || f.state === 'dead') {
      this.gfx.clear();
      return;
    }

    // Fixed-rate physics, decoupled from the frame rate.
    this.acc += dt;
    let steps = 0;
    while (this.acc >= 1 && steps < 4) {
      this.step(ax, ay, facing, f.grounded ? y : null);
      this.acc -= 1;
      steps++;
    }
    if (steps === 4) this.acc = 0;

    // Crack: the tip outruns everything during the strike.
    if (motion && attack && f.attack && !this.cracked && f.attack.frame >= attack.startup) {
      const n = this.segments();
      const t = this.pts[n];
      if (Math.hypot(t.x - t.px, t.y - t.py) > 6) {
        this.cracked = true;
        this.onCrack(t.x, t.y, !!motion.heavy);
      }
    }
    this.draw();
  }

  private segments(): number {
    return Math.max(1, Math.min(this.pts.length - 1, Math.round((this.length * Math.max(0.15, this.extend)) / SEG)));
  }

  /** Sets the guide angle and stiffness for this attack frame. */
  private plan(m: Motion, a: AttackDefinition, f: FighterState) {
    const fr = f.attack!.frame;
    const S = a.startup;
    const hang = 100; // rope hanging slightly behind
    const charging = !!a.charge && f.attack!.charge > 0 && fr === a.charge.frame;
    if (m.spin) {
      // Whirl: two full turns across the active window, starting during the wind-up.
      const total = S + a.active;
      this.spinPhase = (fr / total) * 720 + (fr < S ? 0 : 90);
      this.guideAngle = m.wind + this.spinPhase;
      this.guideK = fr < S + a.active ? 0.42 : 0.05;
      return;
    }
    if (charging) {
      // Holding the heavy: the rope circles overhead, faster as the charge builds.
      const c = f.attack!.charge;
      this.spinPhase += 16 + Math.min(14, c * 0.4);
      this.guideAngle = -90 + this.spinPhase;
      this.guideK = 0.38;
      return;
    }
    if (fr < S) {
      this.guideAngle = hang + (m.wind - hang) * ease(fr / Math.max(1, S - 1));
      this.guideK = 0.22;
    } else if (fr < S + a.active + 2) {
      // Snap toward the strike in ~2 ticks; the loose tip follows late and overshoots.
      const k = ease((fr - S + 1) / 2);
      this.guideAngle = m.wind + (m.strike - m.wind) * k;
      this.guideK = 0.62;
    } else {
      // Recovery: the hand relaxes, the rope drops and swings.
      const r = fr - (S + a.active + 2);
      this.guideAngle = m.strike;
      this.guideK = Math.max(0, 0.3 - r * 0.06);
    }
  }

  /** `floor` = ground height under a grounded fighter: the rope drags on it instead of sinking. */
  private step(ax: number, ay: number, facing: 1 | -1, floor: number | null) {
    const n = this.segments();
    const rest = (this.length / Math.max(1, Math.round(this.length / SEG))) * Math.max(0.15, this.extend);
    const ang = this.guideAngle * DEG;
    const dx = Math.cos(ang) * facing;
    const dy = Math.sin(ang);
    for (let i = 1; i <= n; i++) {
      const p = this.pts[i];
      const vx = (p.x - p.px) * DAMPING;
      const vy = (p.y - p.py) * DAMPING;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + GRAVITY;
      if (this.guideK > 0) {
        // Stiff near the hand, loose at the tip.
        const k = this.guideK * (1 - 0.8 * (i / n));
        const d = rest * i;
        const tx = ax + dx * d;
        const ty = ay + dy * d * (this.spinning ? SPIN_FLATTEN : 1);
        p.x += (tx - p.x) * k;
        p.y += (ty - p.y) * k;
      }
    }
    // Rope constraints, hand pinned.
    for (let it = 0; it < ITERATIONS; it++) {
      this.pts[0].x = ax;
      this.pts[0].y = ay;
      for (let i = 0; i < n; i++) {
        const a = this.pts[i];
        const b = this.pts[i + 1];
        const ddx = b.x - a.x;
        const ddy = b.y - a.y;
        const dist = Math.hypot(ddx, ddy) || 0.0001;
        const diff = (dist - rest) / dist;
        if (i === 0) {
          b.x -= ddx * diff;
          b.y -= ddy * diff;
        } else {
          a.x += ddx * diff * 0.5;
          a.y += ddy * diff * 0.5;
          b.x -= ddx * diff * 0.5;
          b.y -= ddy * diff * 0.5;
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
    // Points past the current length ride on the tip (ready for the next unfurl).
    for (let i = n + 1; i < this.pts.length; i++) Object.assign(this.pts[i], { x: this.pts[n].x, y: this.pts[n].y, px: this.pts[n].x, py: this.pts[n].y });
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
    const chain = this.spec.chain;
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

