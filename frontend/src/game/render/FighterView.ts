import Phaser from 'phaser';
import { COMBAT, type AttackDefinition, type FighterState } from '@magiclash/shared';
import { ANCHOR_X, ANCHOR_Y, ATTACK_ANIMS, CELL, LOOPS, STYLES, type FighterStyle } from './fighterSprite';
import { TEAM_RAMPS, type TeamColor } from './palette';
import { ensureFighterTexture } from './textures';
import { pixelText } from '../../ui/text';

/**
 * Draws one fighter from simulation state. Holds no gameplay state: everything it shows is
 * derived from FighterState (+ a few purely cosmetic timers).
 */
export class FighterView {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly tag: Phaser.GameObjects.BitmapText;
  private readonly style: FighterStyle;
  private readonly bodyH: number;
  private landTicks = 0;
  private flashTicks = 0;

  constructor(
    scene: Phaser.Scene,
    readonly characterId: string,
    readonly team: TeamColor,
    label: string,
    bodyH: number,
  ) {
    this.style = STYLES[characterId];
    this.bodyH = bodyH;
    const key = ensureFighterTexture(scene, characterId, team);
    this.shadow = scene.add.image(0, 0, 'shadow').setAlpha(0.45).setDepth(9);
    this.sprite = scene.add.image(0, 0, key, 'idle_0').setDepth(10);
    this.sprite.setOrigin(ANCHOR_X / CELL, ANCHOR_Y / CELL);
    this.tag = pixelText(scene, 0, 0, label, { align: 'center', color: TEAM_RAMPS[team][3], fixed: false, depth: 11 });
  }

  onLand(): void {
    this.landTicks = 5;
  }

  onHit(): void {
    this.flashTicks = 3;
  }

  frameFor(f: FighterState, attack: AttackDefinition | undefined, t: number): string {
    const loops = LOOPS[this.style.family];
    const loop = (name: string, speed: number) => `${name}_${Math.floor(t / speed) % loops[name].length}`;
    let name: string;
    switch (f.state) {
      case 'idle':
        name = this.landTicks > 0 ? 'land_0' : loop('idle', 10);
        break;
      case 'run':
        name = loop('run', 5);
        break;
      case 'air':
        name = f.vy < -1.2 ? 'jump_0' : 'fall_0';
        break;
      case 'landing':
        name = 'land_0';
        break;
      case 'dodge':
        name = 'dodge_0';
        break;
      case 'hitstun':
        name = !f.grounded && Math.hypot(f.vx, f.vy) > COMBAT.trailSpeed * 0.6 ? 'tumble_0' : 'hitstun_0';
        break;
      case 'attack': {
        const anim = attack ? ATTACK_ANIMS[attack.anim] : undefined;
        if (!attack || !anim || !f.attack) {
          name = 'idle_0';
          break;
        }
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
        name = `${attack.anim}_${phase}_${Math.min(list.length - 1, Math.floor(k * list.length))}`;
        break;
      }
      default:
        name = 'idle_0';
    }
    return this.style.throwable && f.weaponOut ? `u_${name}` : name;
  }

  update(f: FighterState, x: number, y: number, attack: AttackDefinition | undefined, t: number): void {
    if (this.landTicks > 0) this.landTicks--;
    const alive = f.state !== 'dead';
    this.sprite.setVisible(alive);
    this.shadow.setVisible(alive && f.grounded);
    this.tag.setVisible(alive);
    if (!alive) return;

    this.sprite.setFrame(this.frameFor(f, attack, t));
    this.sprite.setFlipX(f.facing < 0);

    const jitter = f.hitlag > 0 && f.state === 'hitstun' ? (t % 2 === 0 ? 1 : -1) : 0;
    const px = Math.round(x);
    const py = Math.round(y);
    this.sprite.setPosition(px + (f.facing < 0 ? 1 : 0) + jitter, py);
    this.shadow.setPosition(px, py + 1);
    this.tag.setPosition(px, py - this.bodyH - 26);

    if (this.flashTicks > 0 || (f.hitlag > 0 && f.state === 'hitstun' && t % 4 < 2)) {
      this.sprite.setTintFill(0xffffff);
      if (this.flashTicks > 0) this.flashTicks--;
    } else if (f.slowTicks > 0) {
      this.sprite.setTint(0xa8e4f5); // chilled
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
    this.tag.destroy();
  }
}
