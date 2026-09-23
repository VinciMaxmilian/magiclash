import Phaser from 'phaser';
import { COMBAT, type AttackDefinition, type FighterState } from '@magiclash/shared';
import { ANCHOR_X, ANCHOR_Y, CELL, KNIGHT_ATTACKS } from './knightSprite';
import type { TeamColor } from './palette';

/**
 * Draws one fighter from simulation state. Holds no gameplay state: everything it shows is
 * derived from FighterState (+ a few purely cosmetic timers).
 */
export class FighterView {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly texture: string;
  private landTicks = 0;
  private flashTicks = 0;

  constructor(scene: Phaser.Scene, readonly team: TeamColor) {
    this.texture = `knight_${team}`;
    this.shadow = scene.add.image(0, 0, 'shadow').setAlpha(0.45).setDepth(9);
    this.sprite = scene.add.image(0, 0, this.texture, 'idle_0').setDepth(10);
    this.sprite.setOrigin(ANCHOR_X / CELL, ANCHOR_Y / CELL);
  }

  onLand(): void {
    this.landTicks = 5;
  }

  onHit(): void {
    this.flashTicks = 3;
  }

  /** Current frame name for a given state. `t` = render tick counter for loops. */
  frameFor(f: FighterState, attack: AttackDefinition | undefined, t: number): string {
    switch (f.state) {
      case 'idle':
        return this.landTicks > 0 ? 'land_0' : `idle_${Math.floor(t / 10) % 4}`;
      case 'run':
        return `run_${Math.floor(t / 5) % 6}`;
      case 'air':
        return f.vy < -1.2 ? 'jump_0' : 'fall_0';
      case 'landing':
        return 'land_0';
      case 'dodge':
        return 'dodge_0';
      case 'hitstun': {
        const speed = Math.hypot(f.vx, f.vy);
        return !f.grounded && speed > COMBAT.trailSpeed * 0.6 ? 'tumble_0' : 'hitstun_0';
      }
      case 'attack': {
        if (!attack || !f.attack) return 'idle_0';
        const anim = KNIGHT_ATTACKS[attack.anim];
        if (!anim) return 'idle_0';
        const fr = f.attack.frame;
        let phase: 'startup' | 'active' | 'recovery';
        let k: number;
        if (fr < attack.startup) {
          phase = 'startup';
          k = fr / attack.startup;
        } else if (fr < attack.startup + attack.active) {
          phase = 'active';
          k = (fr - attack.startup) / attack.active;
        } else {
          phase = 'recovery';
          k = (fr - attack.startup - attack.active) / Math.max(1, attack.recovery);
        }
        const list = anim[phase];
        return `${attack.anim}_${phase}_${Math.min(list.length - 1, Math.floor(k * list.length))}`;
      }
      default:
        return 'idle_0';
    }
  }

  update(f: FighterState, x: number, y: number, attack: AttackDefinition | undefined, t: number): void {
    if (this.landTicks > 0) this.landTicks--;
    const alive = f.state !== 'dead';
    this.sprite.setVisible(alive);
    this.shadow.setVisible(alive && f.grounded);
    if (!alive) return;

    this.sprite.setFrame(this.frameFor(f, attack, t));
    this.sprite.setFlipX(f.facing < 0);

    // Hitstop jitter on the victim sells the impact.
    const jitter = f.hitlag > 0 && f.state === 'hitstun' ? (t % 2 === 0 ? 1 : -1) : 0;
    this.sprite.setPosition(Math.round(x) + (f.facing < 0 ? 1 : 0) + jitter, Math.round(y));
    this.shadow.setPosition(Math.round(x), Math.round(y) + 1);

    if (this.flashTicks > 0 || (f.hitlag > 0 && f.state === 'hitstun' && t % 4 < 2)) {
      this.sprite.setTintFill(0xffffff);
      if (this.flashTicks > 0) this.flashTicks--;
    } else {
      this.sprite.clearTint();
    }

    let alpha = 1;
    if (f.state === 'dodge') alpha = 0.55;
    else if (f.invuln > 0 && Math.floor(t / 4) % 2 === 0) alpha = 0.45;
    this.sprite.setAlpha(alpha);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
