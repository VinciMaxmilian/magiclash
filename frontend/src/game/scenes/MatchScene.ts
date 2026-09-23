import Phaser from 'phaser';
import {
  BotController,
  COMBAT,
  Simulation,
  TICK_RATE,
  TICK_SECONDS,
  type BotDifficulty,
  type FighterState,
  type SimEvent,
} from '@magiclash/shared';
import { svc } from '../services';
import { StageView } from '../maps/StageView';
import { FighterView } from '../render/FighterView';
import { EffectManager } from '../effects/EffectManager';
import { SLASHES } from '../render/effectSprites';
import { PAL, TEAM_RAMPS, type TeamColor } from '../render/palette';
import { ensurePanel } from '../render/textures';
import { Hud } from '../../ui/Hud';
import { pixelText, setPixelText } from '../../ui/text';
import type { DebugOverlay } from '../debug/DebugOverlay';
import type { SfxId } from '../audio/sfx';
import { DIFFICULTY_LABEL } from './labels';

export interface MatchSceneData {
  difficulty: BotDifficulty;
  seed?: number;
}

export interface ResultsData {
  winnerTeam: number;
  playerTeam: number;
  difficulty: BotDifficulty;
  durationTicks: number;
  fighters: { name: string; team: TeamColor; stats: FighterState['stats']; stocks: number }[];
}

const STAGE_ID = 'castle_courtyard';
const TEAMS: TeamColor[] = ['blue', 'red'];
const MAX_STEPS_PER_FRAME = 5;
const END_DELAY_SECONDS = 2.2;

interface Indicator {
  root: Phaser.GameObjects.Container;
  damage: Phaser.GameObjects.BitmapText;
}

export class MatchScene extends Phaser.Scene {
  private sim!: Simulation;
  private bot!: BotController;
  private views: FighterView[] = [];
  private fx!: EffectManager;
  private stageView!: StageView;
  private hud!: Hud;
  private debug?: DebugOverlay;
  private indicators: Indicator[] = [];
  /** Attack instance whose swing effect was already shown, per fighter. */
  private swingShown: (FighterState['attack'] | undefined)[] = [];
  private pauseMenu!: Phaser.GameObjects.Container;
  private pauseItems: Phaser.GameObjects.BitmapText[] = [];
  private pauseCursor = 0;

  private difficulty: BotDifficulty = 'medium';
  private prev: { x: number; y: number }[] = [];
  private acc = 0;
  private renderTick = 0;
  private paused = false;
  private slowmo = false;
  private endTimer = 0;
  private leaving = false;
  private camX = 0;
  private camY = -60;
  private fps = 60;

  constructor() {
    super('Match');
  }

  create(data: MatchSceneData): void {
    const s = svc();
    s.input.flush();
    this.difficulty = data.difficulty ?? 'medium';
    const seed = data.seed ?? (Math.floor(Math.random() * 0x7fffffff) | 0);

    this.sim = new Simulation({
      stageId: STAGE_ID,
      fighters: [
        { characterId: 'knight', team: 0, name: 'VOCÊ' },
        { characterId: 'knight', team: 1, name: 'BOT' },
      ],
      stocks: 3,
      timeLimit: 240,
      seed,
      countdownTicks: 3 * TICK_RATE,
    });
    this.bot = new BotController(this.sim, 1, this.difficulty, seed + 1);

    this.acc = 0;
    this.swingShown = [];
    this.renderTick = 0;
    this.paused = false;
    this.slowmo = false;
    this.endTimer = 0;
    this.leaving = false;
    this.fx = new EffectManager(this);
    this.stageView = new StageView(this, STAGE_ID, this.fx);
    this.views = this.sim.state.fighters.map((_, i) => new FighterView(this, TEAMS[i]));
    this.prev = this.sim.state.fighters.map((f) => ({ x: f.x, y: f.y }));
    this.hud = new Hud(this, this.sim.state.fighters, TEAMS, ['VOCÊ', `BOT ${DIFFICULTY_LABEL[this.difficulty]}`]);
    this.createIndicators();
    this.createPauseMenu();

    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    this.camX = 0;
    this.camY = -60;
    cam.setScroll(this.camX - 320, this.camY - 180);
    cam.fadeIn(250, 26, 20, 34);

    if (__DEV_TOOLS__) {
      void import('../debug/DebugOverlay').then((m) => {
        if (this.scene.isActive()) this.debug = new m.DebugOverlay(this);
      });
    }

    s.audio.startAmbient();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      s.audio.stopAmbient();
      this.debug = undefined;
      this.indicators = [];
      this.views = [];
    });
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  override update(_time: number, deltaMs: number): void {
    const { input } = svc();
    input.update();
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, deltaMs)) * 0.05;

    if (__DEV_TOOLS__) {
      if (input.wasPressed('debug')) this.debug?.toggle();
      if (input.wasPressed('slowmo')) this.slowmo = !this.slowmo;
    }

    if (input.consume('pause') && this.sim.state.match.status !== 'ended') {
      this.setPaused(!this.paused);
      input.consume('back');
    }
    if (this.paused) {
      this.updatePauseMenu();
      return;
    }

    const timeScale = this.slowmo ? 0.25 : 1;
    const dt = Math.min(deltaMs, 100) / 1000;
    this.acc += dt * timeScale;
    let steps = 0;
    while (this.acc >= TICK_SECONDS && steps < MAX_STEPS_PER_FRAME) {
      this.stepSim();
      this.acc -= TICK_SECONDS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0; // spiral-of-death guard after a long stall

    const alpha = this.acc / TICK_SECONDS;
    const dtTicks = (Math.min(deltaMs, 100) / (1000 / 60)) * timeScale;
    this.renderTick += dtTicks;
    this.render(alpha, dtTicks);

    if (this.sim.state.match.status === 'ended' && !this.leaving) {
      this.endTimer += dt;
      if (this.endTimer >= END_DELAY_SECONDS) this.finish();
    }
  }

  private stepSim(): void {
    const { input } = svc();
    const fighters = this.sim.state.fighters;
    this.prev = fighters.map((f) => ({ x: f.x, y: f.y }));
    const inputs = [input.gameplayFrame(), this.bot.think(this.sim)];
    const events = this.sim.step(inputs);
    for (const e of events) this.onEvent(e);

    fighters.forEach((f, i) => {
      // Swing effects + whoosh on the first active frame.
      const atk = this.sim.attackOf(f);
      if (atk && f.attack && f.attack.frame >= atk.startup && this.swingShown[i] !== f.attack) {
        this.swingShown[i] = f.attack;
        this.onActiveStart(i, atk.effect, atk.sound);
      }
      // Knockback trails while flying fast.
      if (f.state === 'hitstun' && f.hitlag === 0) {
        const speed = Math.hypot(f.vx, f.vy);
        if (speed > COMBAT.trailSpeed && this.sim.state.tick % 2 === 0) {
          this.fx.afterimage(this.views[i].sprite, TEAM_RAMPS[TEAMS[i]][3], 10);
          this.fx.burst(f.x, f.y - 14, 1, [PAL.steel[4], TEAM_RAMPS[TEAMS[i]][2]], { speed: 0.4, life: 14, gravity: 0 });
        }
      }
    });
  }

  private play(id: SfxId, pitch = 1) {
    svc().audio.play(id, 'sfx', pitch);
  }

  private onActiveStart(i: number, effect: string, sound: string) {
    const f = this.sim.state.fighters[i];
    const follow = () => {
      const g = this.sim.state.fighters[i];
      return g.state === 'dead' ? null : { x: this.views[i].sprite.x, y: this.views[i].sprite.y, flip: g.facing < 0 };
    };
    const slash = SLASHES[effect];
    if (slash) {
      this.fx.spawn(`fx_${effect}`, f.x, f.y, { flip: f.facing < 0, follow, dx: slash.ox, dy: slash.oy, frameTicks: 2 });
    } else if (effect === 'thrust') {
      this.fx.spawn('fx_thrust', f.x, f.y, { flip: f.facing < 0, follow, dx: 12, dy: -19, frameTicks: 3 });
    } else if (effect === 'thrust_down' || effect === 'plunge') {
      this.fx.spawn(`fx_${effect}`, f.x, f.y, { follow, dx: 0, dy: effect === 'plunge' ? -40 : -30, frameTicks: 3 });
    }
    this.play(sound === 'sword_heavy' ? 'sword_heavy' : 'sword_light');
  }

  private onEvent(e: SimEvent): void {
    const fighters = this.sim.state.fighters;
    switch (e.type) {
      case 'hit': {
        const big = e.damage >= 10 || e.launch >= 9;
        this.fx.spawn(big ? 'fx_spark_big' : 'fx_spark', e.x, e.y, { frameTicks: 2, depth: 26 });
        this.fx.burst(e.x, e.y, big ? 14 : 7, [PAL.fire[4], PAL.fire[3], PAL.white], {
          speed: big ? 3.2 : 2.2,
          angle: e.angle,
          spread: 1.4,
          life: big ? 22 : 14,
          gravity: 0.08,
        });
        this.fx.shake(Math.min(6, 1 + e.launch * 0.3), big ? 16 : 8);
        this.views[e.target].onHit();
        this.play(big ? 'hit_heavy' : 'hit_light', big ? 1 : 1.1);
        if (fighters[e.target].grounded) this.fx.spawn('fx_dust', fighters[e.target].x, fighters[e.target].y, { frameTicks: 3 });
        break;
      }
      case 'jump': {
        const f = fighters[e.fighter];
        if (e.kind === 'air') {
          this.fx.spawn('fx_ring', f.x, f.y, { frameTicks: 3 });
          this.play('jump_air');
        } else {
          this.fx.spawn('fx_dust', f.x, f.y, { frameTicks: 3 });
          this.play('jump');
        }
        break;
      }
      case 'land': {
        const f = fighters[e.fighter];
        this.views[e.fighter].onLand();
        if (e.speed > 2.5) {
          this.fx.spawn('fx_dust', f.x, f.y, { frameTicks: 3 });
          this.play('land', 0.9 + Math.min(0.3, e.speed / 20));
        }
        if (e.speed > 7) this.fx.shake(2, 6);
        break;
      }
      case 'bounce':
        this.fx.spawn('fx_dust', e.x, e.y, { frameTicks: 2 });
        this.fx.shake(3, 8);
        this.play('bounce');
        break;
      case 'dodge':
        this.fx.afterimage(this.views[e.fighter].sprite, PAL.steel[3], 10);
        this.play('dodge');
        break;
      case 'ko': {
        const team = TEAM_RAMPS[TEAMS[e.fighter]];
        const cx = Math.max(-300, Math.min(300, e.x));
        const cy = Math.max(-260, Math.min(160, e.y));
        const toCenter = Math.atan2(-60 - cy, 0 - cx);
        this.fx.burst(cx, cy, 40, [team[3], team[2], PAL.white, PAL.fire[4]], {
          speed: 5,
          angle: toCenter,
          spread: 1.2,
          life: 34,
          gravity: 0,
          size: 2,
          drag: 0.92,
        });
        this.fx.shake(6, 24);
        this.play('ko');
        const byPlayer = e.by === 0;
        this.hud.showBanner(byPlayer ? 'KO!' : e.fighter === 0 ? 'CAIU!' : 'KO!', byPlayer ? PAL.gold[3] : team[3], 45);
        break;
      }
      case 'respawn':
        this.fx.spawn('fx_ring', fighters[e.fighter].x, fighters[e.fighter].y, { frameTicks: 4 });
        this.play('respawn');
        break;
      case 'countdown':
        this.hud.showBanner(String(e.value), PAL.steel[4], 50);
        svc().audio.play('countdown', 'ui');
        break;
      case 'match_start':
        this.hud.showBanner('LUTE!', PAL.gold[3], 45);
        svc().audio.play('go', 'ui');
        break;
      case 'match_end':
        this.hud.showBanner(e.winnerTeam === 0 ? 'VITÓRIA!' : e.winnerTeam < 0 ? 'EMPATE' : 'DERROTA', PAL.gold[3], 200);
        break;
      default:
        break;
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private render(alpha: number, dtTicks: number): void {
    const fighters = this.sim.state.fighters;
    const t = Math.floor(this.renderTick);
    fighters.forEach((f, i) => {
      const p = this.prev[i];
      const jump = Math.abs(f.x - p.x) + Math.abs(f.y - p.y) > 60; // respawn teleport: no lerp
      const x = jump ? f.x : p.x + (f.x - p.x) * alpha;
      const y = jump ? f.y : p.y + (f.y - p.y) * alpha;
      this.views[i].update(f, x, y, this.sim.attackOf(f), t);
    });

    this.fx.update(dtTicks);
    this.stageView.update(dtTicks);
    this.updateCamera(dtTicks);
    this.updateIndicators();
    this.hud.update(fighters, this.sim.state.match, dtTicks);
    this.debug?.update(this.sim, this.fps, [this.bot], this.slowmo);
  }

  private updateCamera(dtTicks: number): void {
    const alive = this.sim.state.fighters.filter((f) => f.state !== 'dead');
    const bz = this.sim.stage.blastZone;
    // Only frame fighters that are reasonably close to the arena, so a launched fighter
    // doesn't drag the camera to the edge of the world.
    const framed = alive.filter((f) => f.x > bz.left + 80 && f.x < bz.right - 80 && f.y > bz.top + 80);
    const list = framed.length ? framed : alive;
    let tx = 0;
    let ty = -60;
    if (list.length) {
      tx = list.reduce((a, f) => a + f.x, 0) / list.length;
      ty = list.reduce((a, f) => a + f.y, 0) / list.length - 40;
    }
    const c = this.sim.stage.camera;
    tx = Math.max(c.minX, Math.min(c.maxX, tx));
    ty = Math.max(c.minY, Math.min(c.maxY, ty));
    const k = 1 - Math.pow(1 - 0.08, dtTicks);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.cameras.main.setScroll(
      Math.round(this.camX - 320 + this.fx.shakeX),
      Math.round(this.camY - 180 + this.fx.shakeY),
    );
  }

  // ── Off-screen indicators ───────────────────────────────────────────────────

  private createIndicators(): void {
    this.indicators = this.sim.state.fighters.map((_, i) => {
      const root = this.add.container(0, 0).setDepth(900);
      root.add(this.add.image(0, 0, ensurePanel(this, 26, 26, TEAM_RAMPS[TEAMS[i]][2])));
      root.add(this.add.image(0, -1, `portrait_${TEAMS[i]}`));
      const damage = pixelText(this, 0, 13, '', { align: 'center', fixed: false });
      root.add(damage);
      root.setScrollFactor(0, 0, true).setVisible(false);
      return { root, damage };
    });
  }

  private updateIndicators(): void {
    const cam = this.cameras.main;
    this.sim.state.fighters.forEach((f, i) => {
      const ind = this.indicators[i];
      const sx = this.views[i].sprite.x - cam.scrollX;
      const sy = this.views[i].sprite.y - 16 - cam.scrollY;
      const off = f.state !== 'dead' && (sx < 0 || sx > 640 || sy < 0 || sy > 360);
      ind.root.setVisible(off);
      if (!off) return;
      ind.root.setPosition(Math.round(Math.max(18, Math.min(622, sx))), Math.round(Math.max(18, Math.min(318, sy))));
      setPixelText(ind.damage, `${Math.floor(f.damage)}%`);
    });
  }

  // ── Pause ───────────────────────────────────────────────────────────────────

  private createPauseMenu(): void {
    this.pauseMenu = this.add.container(0, 0).setDepth(2000);
    const dim = this.add.rectangle(320, 180, 640, 360, PAL.ink, 0.6);
    this.pauseMenu.add(dim);
    this.pauseMenu.add(this.add.image(320, 176, ensurePanel(this, 200, 92)));
    this.pauseMenu.add(pixelText(this, 320, 138, 'PAUSA', { align: 'center', color: PAL.gold[3], fixed: false }));
    this.pauseItems = ['CONTINUAR', 'REINICIAR', 'MENU PRINCIPAL'].map((label, i) => {
      const t = pixelText(this, 256, 160 + i * 14, label, { fixed: false });
      this.pauseMenu.add(t);
      return t;
    });
    this.pauseMenu.setScrollFactor(0, 0, true).setVisible(false);
  }

  private setPaused(p: boolean): void {
    this.paused = p;
    this.pauseCursor = 0;
    this.pauseMenu.setVisible(p);
    this.refreshPause();
    svc().audio.play(p ? 'ui_confirm' : 'ui_back', 'ui');
  }

  private refreshPause(): void {
    const labels = ['CONTINUAR', 'REINICIAR', 'MENU PRINCIPAL'];
    this.pauseItems.forEach((t, i) => {
      setPixelText(t, `${i === this.pauseCursor ? '> ' : '  '}${labels[i]}`);
      t.setTint(i === this.pauseCursor ? PAL.gold[3] : PAL.steel[3]);
    });
  }

  private updatePauseMenu(): void {
    const { input, audio } = svc();
    if (input.wasPressed('up')) this.pauseCursor = (this.pauseCursor + 2) % 3;
    if (input.wasPressed('down')) this.pauseCursor = (this.pauseCursor + 1) % 3;
    if (input.wasPressed('up') || input.wasPressed('down')) audio.play('ui_move', 'ui');
    this.refreshPause();
    if (input.consume('back')) {
      this.setPaused(false);
      return;
    }
    if (!input.wasPressed('confirm')) return;
    audio.play('ui_confirm', 'ui');
    if (this.pauseCursor === 0) this.setPaused(false);
    else if (this.pauseCursor === 1) this.scene.restart({ difficulty: this.difficulty });
    else this.scene.start('Title');
  }

  // ── End ─────────────────────────────────────────────────────────────────────

  private finish(): void {
    this.leaving = true;
    const s = this.sim.state;
    const data: ResultsData = {
      winnerTeam: s.match.winnerTeam ?? -1,
      playerTeam: 0,
      difficulty: this.difficulty,
      durationTicks: s.match.endTick,
      fighters: s.fighters.map((f, i) => ({ name: i === 0 ? 'VOCÊ' : 'BOT', team: TEAMS[i], stats: f.stats, stocks: f.stocks })),
    };
    this.cameras.main.fadeOut(300, 26, 20, 34);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Results', data));
  }
}
