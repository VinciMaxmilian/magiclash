import Phaser from 'phaser';
import {
  BotController,
  COMBAT,
  Predictor,
  Simulation,
  TICK_RATE,
  TICK_SECONDS,
  getCharacter,
  type AttackDefinition,
  type FighterState,
  type ServerMsg,
  type SimEvent,
} from '@magiclash/shared';
import type { NetClient } from '../net/NetClient';
import type { JoinInfo } from '../../services/online';
import { svc } from '../services';
import { StageView } from '../maps/StageView';
import { FighterView } from '../render/FighterView';
import { ProjectileViews } from '../render/ProjectileView';
import { EffectManager } from '../effects/EffectManager';
import { SLASHES } from '../render/effectSprites';
import { BLOOD, DARK, HELL } from '../render/season1Sprites';
import { EFFECT_ORIGINS } from '../render/textures';
import { PAL, TEAM_RAMPS, type TeamColor } from '../render/palette';
import { ensurePanel } from '../render/textures';
import { publicAvatarUrl } from '../render/avatars';
import { Hud } from '../../ui/Hud';
import { pixelText, setPixelText } from '../../ui/text';
import type { DebugOverlay } from '../debug/DebugOverlay';
import type { SfxId } from '../audio/sfx';
import { defaultSetup, type MatchSetup } from '../match/setup';

export interface ResultsData {
  setup: MatchSetup;
  winnerTeam: number;
  durationTicks: number;
  fighters: {
    label: string;
    characterId: string;
    color: TeamColor;
    team: number;
    stats: FighterState['stats'];
    stocks: number;
    /** Rated online matches only (computed by the database). */
    rating?: { before: number; after: number };
  }[];
  /** Present for online matches: whether the server recorded the result. */
  online?: { recorded: boolean; ranked: boolean; youTeam: number };
}

interface NetSession {
  client: NetClient;
  start: Extract<ServerMsg, { t: 'start' }>;
  join: JoinInfo;
}

type Element = 'fire' | 'ice' | 'lightning' | 'steel' | 'arcane' | 'blood' | 'dark' | 'feather';
const ELEMENT_RAMP: Record<Element, readonly number[]> = {
  fire: PAL.fire,
  ice: PAL.ice,
  lightning: PAL.lightning,
  steel: PAL.steel,
  arcane: PAL.ice,
  blood: BLOOD,
  dark: DARK,
  feather: [PAL.steel[2], PAL.steel[3], PAL.steel[4], PAL.white, PAL.white],
};
const CHARACTER_ELEMENT: Record<string, Element> = {
  fire_mage: 'fire',
  ice_mage: 'ice',
  lightning_mage: 'lightning',
  vampire: 'dark',
  dhampir: 'blood',
};

const elementOfEffect = (effect: string, characterId: string): Element => {
  if (effect.startsWith('fire')) return 'fire';
  if (effect.startsWith('frost')) return 'ice';
  if (effect.startsWith('shock')) return 'lightning';
  if (effect.startsWith('arcane')) return 'arcane';
  if (effect.startsWith('blood') || effect === 'teleport') return 'blood';
  if (effect.startsWith('dark') || effect.startsWith('bat')) return 'dark';
  if (effect.startsWith('feather')) return 'feather';
  return CHARACTER_ELEMENT[characterId] ?? 'steel';
};

/** Projectile sprite → trail colors (null = no trail). */
const trailRamp = (sprite: string): readonly number[] | null => {
  if (sprite.startsWith('hell') || sprite.startsWith('inferno')) return HELL;
  if (sprite.includes('fire') || sprite === 'phoenix') return PAL.fire;
  if (sprite.startsWith('azure') || sprite === 'rune_disc' || sprite === 'dragon' || sprite.includes('ice')) return PAL.ice;
  if (sprite.startsWith('crimson')) return BLOOD;
  if (sprite === 'dove') return ELEMENT_RAMP.feather;
  if (sprite.includes('ball') || sprite.includes('spark')) return PAL.lightning;
  return null;
};

const MAX_STEPS_PER_FRAME = 5;
const END_DELAY_SECONDS = 2.2;

interface Indicator {
  root: Phaser.GameObjects.Container;
  damage: Phaser.GameObjects.BitmapText;
}

export class MatchScene extends Phaser.Scene {
  private setup!: MatchSetup;
  private sim!: Simulation;
  private bots: BotController[] = [];
  private human = -1;
  private views: FighterView[] = [];
  private projectiles!: ProjectileViews;
  private fx!: EffectManager;
  private stageView!: StageView;
  private hud!: Hud;
  private debug?: DebugOverlay;
  private indicators: Indicator[] = [];
  /** Swing effect already shown, per fighter (attack id + approximate start tick survives re-simulation). */
  private swingShown: ({ id: string; start: number } | undefined)[] = [];
  private pauseMenu!: Phaser.GameObjects.Container;
  private pauseItems: Phaser.GameObjects.BitmapText[] = [];
  private pauseCursor = 0;

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
  /** Online: the server is authoritative; this scene only sends inputs and renders snapshots. */
  private net: NetSession | null = null;
  private netOff: (() => void)[] = [];
  private predictor: Predictor | null = null;
  /** Visual smoothing of prediction corrections (decays to zero). */
  private corr: { x: number; y: number }[] = [];
  private inputAcc = 0;
  private pingText: Phaser.GameObjects.BitmapText | null = null;
  /** Full-screen white flash (KOs), in the three alpha steps of the art bible. */
  private flash!: Phaser.GameObjects.Rectangle;
  private flashTicks = 0;

  constructor() {
    super('Match');
  }

  create(data: Partial<MatchSetup> & { difficulty?: MatchSetup['slots'][number]['bot']; net?: NetSession }): void {
    const s = svc();
    s.input.flush();
    this.net = data.net ?? null;
    this.netOff = [];
    this.inputAcc = 0;
    this.pingText = null;
    this.predictor = null;
    this.corr = [];
    const seed = Math.floor(Math.random() * 0x7fffffff) | 0;

    if (this.net) {
      const { start, join } = this.net;
      this.setup = {
        stageId: start.config.stageId,
        stocks: start.config.stocks,
        timeLimit: start.config.timeLimit,
        mode: join.mode === 'teams' ? 'teams' : 'ffa',
        // Remote players are "not me" (bot field only marks who is human locally; no bot runs online).
        slots: start.slots.map((sl, i) => ({
          characterId: sl.character,
          color: sl.color,
          team: sl.team,
          label: sl.name,
          bot: i === start.you ? null : 'medium',
          avatarUrl: sl.avatar ? publicAvatarUrl(sl.avatar) : null,
        })),
      };
      this.sim = new Simulation(start.config);
      this.human = start.you;
      this.bots = [];
    } else {
      this.setup = data.slots ? (data as MatchSetup) : defaultSetup(data.difficulty ?? s.settings.difficulty);
      this.sim = new Simulation({
        stageId: this.setup.stageId,
        fighters: this.setup.slots.map((sl) => ({ characterId: sl.characterId, team: sl.team, name: sl.label })),
        stocks: this.setup.stocks,
        timeLimit: this.setup.timeLimit,
        seed,
        countdownTicks: 3 * TICK_RATE,
      });
      this.human = this.setup.slots.findIndex((sl) => sl.bot === null);
      this.bots = this.setup.slots.flatMap((sl, i) => (sl.bot ? [new BotController(this.sim, i, sl.bot, seed + i * 17)] : []));
    }

    this.acc = 0;
    this.swingShown = [];
    this.renderTick = 0;
    this.paused = false;
    this.slowmo = false;
    this.endTimer = 0;
    this.leaving = false;
    this.fx = new EffectManager(this);
    this.stageView = new StageView(this, this.setup.stageId, this.fx);
    this.projectiles = new ProjectileViews(this);
    this.views = this.setup.slots.map(
      (sl, i) => new FighterView(this, sl.characterId, sl.color, sl.label, this.sim.characterOf(this.sim.state.fighters[i]).body.h),
    );
    this.prev = this.sim.state.fighters.map((f) => ({ x: f.x, y: f.y }));
    this.hud = new Hud(
      this,
      this.sim.state.fighters,
      this.setup.slots.map((sl) => ({
        portrait: `portrait_${sl.characterId}_${sl.color}`,
        label: `${sl.label} ${getCharacter(sl.characterId).name}`.length > 15 ? sl.label.slice(0, 15) : `${sl.label} ${getCharacter(sl.characterId).name}`,
        color: sl.color,
        avatarUrl: sl.avatarUrl,
      })),
    );
    this.createIndicators();
    this.createPauseMenu();
    this.flash = this.add.rectangle(320, 180, 640, 360, PAL.white, 0).setScrollFactor(0).setDepth(950);
    this.flashTicks = 0;

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

    if (this.net) this.setupNet(this.net);

    s.audio.startAmbient();
    s.audio.music('battle');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.netOff.forEach((f) => f());
      this.netOff = [];
      s.audio.stopAmbient();
      this.projectiles.clear();
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
      if (!this.net) return; // online never pauses: inputs stop, the match goes on
    }
    if (this.net) {
      this.updateNet(deltaMs);
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

  // ── Online ────────────────────────────────────────────────────────────────

  private setupNet(net: NetSession): void {
    this.predictor = new Predictor(this.sim, this.human);
    this.corr = this.sim.state.fighters.map(() => ({ x: 0, y: 0 }));
    this.pingText = pixelText(this, 634, 6, 'PING --', { align: 'right', depth: 1000 });
    this.netOff.push(
      net.client.on('snap', (m) => this.onSnapshot(m)),
      net.client.on('end', (m) => this.onNetEnd(m)),
      net.client.onClose(() => {
        if (this.leaving || !this.scene.isActive()) return;
        this.leaving = true;
        this.hud.showBanner('CONEXÃO PERDIDA', PAL.fire[2], 120);
        this.time.delayedCall(1800, () => this.scene.start('Online', { message: 'CONEXÃO COM O SERVIDOR PERDIDA' }));
      }),
    );
  }

  private updateNet(deltaMs: number): void {
    const { input } = svc();
    const dt = Math.min(deltaMs, 100) / 1000;
    // Inputs at the simulation rate (60/s), each message carrying the last few for loss resilience.
    this.inputAcc += dt;
    let steps = 0;
    while (this.inputAcc >= TICK_SECONDS && steps < MAX_STEPS_PER_FRAME) {
      const raw = input.gameplayFrame();
      const frame = this.paused ? 0 : raw;
      const seq = this.net!.client.sendInput(frame);
      // Predict locally right away: no round-trip delay on our own fighter.
      this.prev = this.sim.state.fighters.map((f) => ({ x: f.x, y: f.y }));
      const predicted = this.predictor!.predict(seq, frame);
      for (const e of predicted) if (this.isLocalFeedback(e)) this.onEvent(e);
      this.afterAdvance();
      this.inputAcc -= TICK_SECONDS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.inputAcc = 0;
    const alpha = this.inputAcc / TICK_SECONDS;
    const dtTicks = Math.min(deltaMs, 100) / (1000 / 60);
    this.renderTick += dtTicks;
    this.render(alpha, dtTicks);
  }

  /** Events we show instantly from our own prediction (and skip when the server echoes them). */
  private isLocalFeedback(e: SimEvent): boolean {
    return (e.type === 'jump' || e.type === 'dodge') && e.fighter === this.human;
  }

  private onSnapshot(m: Extract<ServerMsg, { t: 'snap' }>): void {
    if (this.leaving || !this.predictor) return;
    const before = this.sim.state.fighters.map((f) => ({ x: f.x, y: f.y }));
    this.predictor.reconcile(m.s, m.ack);
    // Smooth small corrections instead of popping; teleports (respawn, big error) snap.
    this.sim.state.fighters.forEach((f, i) => {
      const dx = before[i].x - f.x;
      const dy = before[i].y - f.y;
      const c = this.corr[i];
      if (Math.abs(dx) + Math.abs(dy) > 48) {
        c.x = 0;
        c.y = 0;
      } else {
        c.x += dx;
        c.y += dy;
      }
      this.prev[i] = { x: f.x, y: f.y };
    });
    for (const e of m.ev) if (!this.isLocalFeedback(e)) this.onEvent(e);
  }

  private onNetEnd(m: Extract<ServerMsg, { t: 'end' }>): void {
    if (this.leaving) return;
    this.leaving = true;
    const net = this.net!;
    const youTeam = this.sim.state.fighters[this.human]?.team ?? -1;
    const data: ResultsData = {
      setup: this.setup,
      winnerTeam: m.winnerTeam,
      durationTicks: m.durationTicks,
      fighters: m.fighters.map((f) => ({
        label: f.name,
        characterId: f.character,
        color: f.color,
        team: f.team,
        stats: f.stats,
        stocks: f.stocks,
        rating: m.ratings?.find((r) => r.slot === f.slot),
      })),
      online: { recorded: m.recorded, ranked: net.client.welcome.ranked, youTeam },
    };
    this.time.delayedCall(1500, () => {
      net.client.close();
      this.cameras.main.fadeOut(300, 26, 20, 34);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Results', data));
    });
  }

  private stepSim(): void {
    const { input } = svc();
    const fighters = this.sim.state.fighters;
    this.prev = fighters.map((f) => ({ x: f.x, y: f.y }));
    const inputs = fighters.map(() => 0);
    if (this.human >= 0) inputs[this.human] = input.gameplayFrame();
    for (const b of this.bots) inputs[b.index] = b.think(this.sim);
    const events = this.sim.step(inputs);
    for (const e of events) this.onEvent(e);
    this.afterAdvance();
  }

  /** Per-tick cosmetic follow-ups (swing effects, charge sparkles, trails). Local and online. */
  private afterAdvance(): void {
    const fighters = this.sim.state.fighters;
    const tick = this.sim.state.tick;
    fighters.forEach((f, i) => {
      const atk = this.sim.attackOf(f);
      const el = elementOfEffect(atk?.effect ?? '', f.characterId);
      if (atk && f.attack) {
        // Swing effects + whoosh on the first active frame.
        const start = tick - f.attack.frame;
        const shown = this.swingShown[i];
        const same = shown && shown.id === atk.id && Math.abs(shown.start - start) <= 12;
        if (f.attack.frame >= atk.startup && !same) {
          this.swingShown[i] = { id: atk.id, start };
          this.onActiveStart(i, atk);
        }
        // Teleport: crimson mist where the fighter vanishes and where it reappears.
        const w = atk.intangible;
        if (w && (f.attack.frame === w.from || f.attack.frame === w.to + 1)) {
          this.fx.spawn('fx_mist', f.x, f.y, { frameTicks: 3, depth: 24 });
          this.fx.burst(f.x, f.y - 18, 10, [BLOOD[1], BLOOD[2], BLOOD[3]], { speed: 1.6, life: 22, gravity: -0.03, spread: Math.PI * 2 });
          if (f.attack.frame === w.from) this.play('teleport');
        }
        // Charging: pulsing glow ring every few ticks.
        if (atk.charge && f.attack.charge > 0 && f.attack.frame === atk.charge.frame && f.attack.charge % 18 === 1) {
          const ramp = el === 'steel' ? PAL.gold : ELEMENT_RAMP[el];
          this.fx.spawn('fx_burst', f.x + f.facing * 6, f.y - 22, { frameTicks: 2, tint: ramp[3], alpha: 0.66 });
        }
        // Charging: particles gathering toward the fighter.
        if (atk.charge && f.attack.charge > 0 && f.attack.frame === atk.charge.frame && tick % 3 === 0) {
          const a = Math.random() * Math.PI * 2;
          const ramp = el === 'steel' ? PAL.gold : ELEMENT_RAMP[el];
          this.fx.burst(f.x + f.facing * 10 + Math.cos(a) * 16, f.y - 22 + Math.sin(a) * 16, 1, [ramp[3], ramp[2]], {
            speed: 1.2, angle: a + Math.PI, spread: 0.2, life: 12, gravity: 0, drag: 1,
          });
        }
        // Elemental trails on moves like fire jet / plunges.
        if (atk.effect.endsWith('_trail') && f.attack.frame >= atk.startup && tick % 2 === 0) {
          const ramp = ELEMENT_RAMP[el];
          this.fx.burst(f.x, f.y - 4, 2, [ramp[2], ramp[3], ramp[4] ?? ramp[3]], { speed: 0.8, angle: Math.PI / 2, spread: 1.2, life: 16, gravity: 0.05 });
          if (atk.effect === 'bat_trail' && tick % 6 === 0) this.spawnBat(f.x, f.y - 20);
        }
      }
      // Chilled fighters shed frost.
      if (f.slowTicks > 0 && f.state !== 'dead' && tick % 6 === 0) {
        this.fx.burst(f.x + (Math.random() - 0.5) * 12, f.y - Math.random() * 30, 1, [PAL.ice[3], PAL.ice[4]], { speed: 0.3, life: 20, gravity: 0.03 });
      }
      // Knockback trails while flying fast.
      if (f.state === 'hitstun' && f.hitlag === 0) {
        const speed = Math.hypot(f.vx, f.vy);
        if (speed > COMBAT.trailSpeed && tick % 2 === 0) {
          const color = this.setup.slots[i].color;
          this.fx.afterimage(this.views[i].sprite, TEAM_RAMPS[color][3], 10);
          this.fx.burst(f.x, f.y - 14, 1, [PAL.steel[4], TEAM_RAMPS[color][2]], { speed: 0.4, life: 14, gravity: 0 });
        }
      }
    });
    // Elemental projectile trails
    if (tick % 2 === 0) {
      for (const p of this.sim.state.projectiles) {
        if (p.stuck >= 0 || p.exploding > 0) continue;
        const def = this.sim.projectileDef(p);
        if (def.attached || def.grounded) continue;
        const sp = def.sprite;
        const ramp = trailRamp(sp);
        if (ramp) this.fx.burst(p.x, p.y, sp === 'inferno_orb' || sp === 'dragon' ? 2 : 1, [ramp[2], ramp[3]], { speed: 0.3, life: 12, gravity: -0.02 });
      }
    }
  }

  /** A bat flying up and away (vampire ascent). Moves via the effect's follow hook. */
  private spawnBat(x: number, y: number) {
    const born = this.renderTick;
    const vx = (Math.random() - 0.5) * 2.4;
    const vy = -0.8 - Math.random() * 0.8;
    this.fx.spawn('fx_bat', x, y, {
      frameTicks: 3,
      depth: 24,
      follow: () => {
        const age = this.renderTick - born;
        return { x: x + vx * age, y: y + vy * age + Math.sin(age / 3) * 2, flip: vx < 0 };
      },
    });
  }

  private play(id: string, pitch = 1) {
    svc().audio.play(id as SfxId, 'sfx', pitch);
  }

  private onActiveStart(i: number, atk: AttackDefinition) {
    const f = this.sim.state.fighters[i];
    const follow = () => {
      const g = this.sim.state.fighters[i];
      return g.state === 'dead' ? null : { x: this.views[i].sprite.x, y: this.views[i].sprite.y, flip: g.facing < 0 };
    };
    const el = elementOfEffect(atk.effect, f.characterId);
    const tint = el === 'steel' ? undefined : ELEMENT_RAMP[el][3];
    const effect = atk.effect;
    const darkSlash = effect === 'dark_slash' ? 'slash_wide' : effect === 'dark_low' ? 'slash_low' : effect === 'teleport' ? (atk.direction === 'up' ? 'slash_up' : 'slash_wide') : null;
    const slashId = SLASHES[effect] ? effect : darkSlash;
    const slash = slashId ? SLASHES[slashId] : undefined;
    if (effect.startsWith('whip_')) {
      const key = `fx_whip_${f.characterId}_${effect.slice(5)}`;
      if (EFFECT_ORIGINS.has(key)) this.fx.spawn(key, f.x, f.y, { flip: f.facing < 0, follow, frameTicks: effect === 'whip_spin' ? 3 : 2, depth: 24 });
      if (effect === 'whip_heavy' || effect === 'whip_spin') this.fx.shake(2, 6);
    } else if (slash && slashId) {
      this.fx.spawn(`fx_${slashId}`, f.x, f.y, { flip: f.facing < 0, follow, dx: slash.ox, dy: slash.oy, frameTicks: 2, tint });
      // Afterglow: a softer, slower copy of the arc gives the swing a smear.
      this.fx.spawn(`fx_${slashId}`, f.x, f.y, {
        flip: f.facing < 0, follow, dx: slash.ox, dy: slash.oy, frameTicks: 3, alpha: 0.33, depth: 24,
        tint: tint ?? PAL.steel[3],
      });
    } else if (effect === 'fire_arc' || effect === 'frost_arc') {
      const d = SLASHES.slash_up;
      this.fx.spawn('fx_slash_up', f.x, f.y, { flip: f.facing < 0, follow, dx: d.ox, dy: d.oy, frameTicks: 2, tint });
    } else if (effect === 'spin') {
      const d = SLASHES.slash_wide;
      for (const flip of [false, true]) {
        this.fx.spawn('fx_slash_wide', f.x, f.y, {
          flip,
          follow: () => {
            const p = follow();
            return p && { ...p, flip };
          },
          dx: d.ox,
          dy: d.oy,
          frameTicks: 3,
        });
      }
    } else if (effect.endsWith('_burst') || effect === 'shock_arc') {
      const ramp = ELEMENT_RAMP[el];
      this.fx.spawn('fx_burst', f.x + f.facing * (effect === 'shock_arc' ? 12 : 0), f.y - 18, { frameTicks: 2, tint: ramp[3] });
      this.fx.burst(f.x, f.y - 18, 12, [ramp[2], ramp[3], ramp[4] ?? ramp[3]], { speed: 2.4, life: 18, gravity: el === 'fire' ? -0.04 : 0.06 });
      this.fx.shake(2, 6);
    } else if (effect === 'thrust') {
      this.fx.spawn('fx_thrust', f.x, f.y, { flip: f.facing < 0, follow, dx: 12, dy: -19, frameTicks: 3 });
    } else if (effect === 'thrust_down' || effect === 'plunge') {
      this.fx.spawn(`fx_${effect}`, f.x, f.y, { follow, dx: 0, dy: effect === 'plunge' ? -40 : -30, frameTicks: 3 });
    }
    this.play(atk.sound);
  }

  private hitEffectFor(e: Extract<SimEvent, { type: 'hit' }>): { key: string; element: Element } {
    const attacker = this.sim.state.fighters[e.attacker];
    const projId = e.attackId.split(':')[0];
    const pdef = this.sim.projectileDefsOf(attacker).get(projId);
    if (pdef) {
      const h = pdef.hitEffect;
      if (h === 'arcane') return { key: 'fx_spark', element: 'arcane' };
      if (h === 'blood') return { key: 'fx_blood', element: 'blood' };
      if (h === 'feather') return { key: 'fx_feather', element: 'feather' };
      if (h === 'explosion') return { key: 'fx_spark_big', element: 'fire' };
      if (h === 'frost') return { key: 'fx_frost', element: 'ice' };
      if (h === 'shock') return { key: 'fx_shock', element: 'lightning' };
      return { key: h === 'spark_big' ? 'fx_spark_big' : 'fx_spark', element: 'steel' };
    }
    const atk = this.sim.attacksOf(attacker).get(e.attackId);
    const el = elementOfEffect(atk?.effect ?? '', attacker.characterId);
    if (el === 'ice') return { key: 'fx_frost', element: el };
    if (el === 'lightning') return { key: 'fx_shock', element: el };
    if (el === 'blood') return { key: 'fx_blood', element: el };
    return { key: e.damage >= 10 || e.launch >= 9 ? 'fx_spark_big' : 'fx_spark', element: el };
  }

  private onEvent(e: SimEvent): void {
    const fighters = this.sim.state.fighters;
    switch (e.type) {
      case 'hit': {
        const big = e.damage >= 10 || e.launch >= 9;
        const { key, element } = this.hitEffectFor(e);
        const ramp = element === 'steel' ? PAL.fire : ELEMENT_RAMP[element];
        this.fx.spawn(key, e.x, e.y, { frameTicks: 2, depth: 26 });
        // Impact flash behind the spark: bigger and brighter the harder the hit.
        this.fx.spawn(big ? 'fx_impact_big' : 'fx_impact', e.x, e.y, { frameTicks: 2, depth: 25, alpha: big ? 1 : 0.66, tint: ramp[4] ?? ramp[3] });
        if (key !== 'fx_spark' && key !== 'fx_spark_big') {
          this.fx.spawn(big ? 'fx_spark_big' : 'fx_spark', e.x, e.y, { frameTicks: 2, depth: 26, tint: ramp[3] });
        }
        this.fx.burst(e.x, e.y, big ? 14 : 7, [ramp[4] ?? ramp[3], ramp[3], PAL.white], {
          speed: big ? 3.2 : 2.2,
          angle: e.angle,
          spread: 1.4,
          life: big ? 22 : 14,
          gravity: 0.08,
        });
        this.fx.shake(Math.min(6, 1 + e.launch * 0.3), big ? 16 : 8);
        this.views[e.target].onHit();
        this.play(big ? 'hit_heavy' : 'hit_light', big ? 1 : 1.1);
        if (element === 'ice') this.play('ice');
        if (element === 'lightning') this.play('zap');
        if (element === 'arcane') this.play('arcane');
        if (element === 'blood') this.play('blood', 1.2);
        if (fighters[e.target].grounded) this.fx.spawn('fx_dust', fighters[e.target].x, fighters[e.target].y, { frameTicks: 3 });
        break;
      }
      case 'projectile_spawn': {
        const def = this.sim.projectileDefsOf(fighters[e.owner]).get(e.defId);
        if (def?.sound) this.play(def.sound);
        if (def?.grounded) this.fx.spawn('fx_dust', e.x, e.y + def.h / 2, { frameTicks: 3 });
        if (def?.id === 'thunderstrike' || def?.id === 'thunder_beam') this.fx.shake(3, 10);
        break;
      }
      case 'projectile_end':
        if (e.reason === 'stage') {
          this.fx.burst(e.x, e.y, 5, [PAL.stone[3], PAL.stone[4]], { speed: 1.2, life: 12 });
          this.play('thud');
        }
        break;
      case 'explosion': {
        const pr = this.sim.state.projectiles.find((p) => p.uid === e.uid);
        const size = pr ? (this.sim.projectileDef(pr).explosion?.w ?? 36) : 36;
        const k = size / 36;
        this.fx.burst(e.x, e.y, Math.round(14 * k), [PAL.fire[2], PAL.fire[3], PAL.fire[4]], { speed: 3 * Math.sqrt(k), life: 20, gravity: -0.03, size: k > 1.5 ? 2 : 1 });
        this.fx.spawn('fx_burst', e.x, e.y, { frameTicks: 2, tint: PAL.fire[3], depth: 21 });
        for (let i = 0; i < Math.min(4, Math.round(2 * k)); i++) {
          this.fx.spawn('fx_smoke', e.x + (Math.random() - 0.5) * size * 0.6, e.y - size * 0.2, { frameTicks: 5, depth: 19, alpha: 0.66 });
        }
        this.fx.shake(Math.min(6, 3 + k * 1.5), 12 + Math.round(k * 4));
        this.play('explosion', k > 1.5 ? 0.8 : 1);
        break;
      }
      case 'weapon_back': {
        const f = fighters[e.fighter];
        this.fx.spawn('fx_ring', f.x, f.y - 20, { frameTicks: 3 });
        this.play('weapon_back');
        break;
      }
      case 'charge_full': {
        const f = fighters[e.fighter];
        this.fx.spawn('fx_burst', f.x + f.facing * 8, f.y - 22, { frameTicks: 1, tint: PAL.gold[3] });
        this.play('charge_full');
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
        if (e.speed > 7) {
          this.fx.shake(2, 6);
          this.fx.spawn('fx_dust', f.x - 8, f.y, { frameTicks: 3, flip: true });
          this.fx.spawn('fx_dust', f.x + 8, f.y, { frameTicks: 3 });
        }
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
        const team = TEAM_RAMPS[this.setup.slots[e.fighter].color];
        const cx = Math.max(-300, Math.min(300, e.x));
        const cy = Math.max(-260, Math.min(160, e.y));
        const toCenter = Math.atan2(-60 - cy, 0 - cx);
        this.fx.burst(cx, cy, 40, [team[3], team[2], PAL.white, PAL.fire[4]], {
          speed: 5, angle: toCenter, spread: 1.2, life: 34, gravity: 0, size: 2, drag: 0.92,
        });
        this.fx.spawn('fx_shockwave', cx, cy, { frameTicks: 3, tint: team[3], depth: 27 });
        this.fx.spawn('fx_impact_big', cx, cy, { frameTicks: 2, depth: 27 });
        this.flashTicks = 6;
        this.fx.shake(6, 24);
        this.play('ko');
        const byHuman = e.by >= 0 && e.by === this.human;
        this.hud.showBanner(byHuman ? 'KO!' : e.fighter === this.human ? 'CAIU!' : 'KO!', byHuman ? PAL.gold[3] : team[3], 45);
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
      case 'match_end': {
        const humanTeam = this.human >= 0 ? this.setup.slots[this.human].team : -99;
        const label = e.winnerTeam < 0 ? 'EMPATE' : this.human < 0 ? 'FIM!' : e.winnerTeam === humanTeam ? 'VITÓRIA!' : 'DERROTA';
        this.hud.showBanner(label, PAL.gold[3], 200);
        break;
      }
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
      let x = jump ? f.x : p.x + (f.x - p.x) * alpha;
      let y = jump ? f.y : p.y + (f.y - p.y) * alpha;
      const c = this.corr[i];
      if (c) {
        x += c.x;
        y += c.y;
        const k = Math.pow(0.8, dtTicks);
        c.x *= k;
        c.y *= k;
      }
      this.views[i].update(f, x, y, this.sim.attackOf(f), t);
    });
    this.projectiles.update(this.sim, t);
    this.fx.update(dtTicks);
    if (this.flashTicks > 0) {
      this.flashTicks = Math.max(0, this.flashTicks - dtTicks);
      this.flash.setAlpha(this.flashTicks > 4 ? 0.33 : this.flashTicks > 2 ? 0.2 : this.flashTicks > 0 ? 0.1 : 0);
    }
    this.stageView.update(dtTicks);
    this.updateCamera(dtTicks);
    this.updateIndicators();
    this.hud.update(fighters, this.sim.state.match, dtTicks);
    this.debug?.update(this.sim, this.fps, this.bots, this.slowmo, this.net?.client.rtt);
    if (this.pingText && this.net) {
      const rtt = Math.round(this.net.client.rtt);
      setPixelText(this.pingText, `PING ${rtt}MS`);
      this.pingText.setTint(rtt < 80 ? PAL.moss[3] : rtt < 150 ? PAL.gold[3] : PAL.fire[2]);
    }
  }

  private updateCamera(dtTicks: number): void {
    const alive = this.sim.state.fighters.filter((f) => f.state !== 'dead');
    const bz = this.sim.stage.blastZone;
    // Only frame fighters reasonably close to the arena, so a launched fighter doesn't drag
    // the camera to the edge of the world.
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
    this.indicators = this.setup.slots.map((sl) => {
      const root = this.add.container(0, 0).setDepth(900);
      root.add(this.add.image(0, 0, ensurePanel(this, 26, 26, TEAM_RAMPS[sl.color][2])));
      root.add(this.add.image(0, -1, `portrait_${sl.characterId}_${sl.color}`));
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

  private get pauseLabels(): string[] {
    return this.net ? ['CONTINUAR', 'SAIR DA PARTIDA'] : ['CONTINUAR', 'REINICIAR', 'TROCAR PERSONAGEM', 'MENU PRINCIPAL'];
  }

  private createPauseMenu(): void {
    this.pauseMenu = this.add.container(0, 0).setDepth(2000);
    this.pauseMenu.add(this.add.rectangle(320, 180, 640, 360, PAL.ink, 0.6));
    this.pauseMenu.add(this.add.image(320, 176, ensurePanel(this, 220, 106)));
    this.pauseMenu.add(pixelText(this, 320, 134, 'PAUSA', { align: 'center', color: PAL.gold[3], fixed: false }));
    this.pauseItems = this.pauseLabels.map((label, i) => {
      const t = pixelText(this, 246, 154 + i * 14, label, { fixed: false });
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
    this.pauseItems.forEach((t, i) => {
      setPixelText(t, `${i === this.pauseCursor ? '> ' : '  '}${this.pauseLabels[i]}`);
      t.setTint(i === this.pauseCursor ? PAL.gold[3] : PAL.steel[3]);
    });
  }

  private updatePauseMenu(): void {
    const { input, audio } = svc();
    const n = this.pauseLabels.length;
    if (input.wasPressed('up')) this.pauseCursor = (this.pauseCursor + n - 1) % n;
    if (input.wasPressed('down')) this.pauseCursor = (this.pauseCursor + 1) % n;
    if (input.wasPressed('up') || input.wasPressed('down')) audio.play('ui_move', 'ui');
    this.refreshPause();
    if (input.consume('back')) {
      this.setPaused(false);
      return;
    }
    if (!input.wasPressed('confirm')) return;
    audio.play('ui_confirm', 'ui');
    if (this.pauseCursor === 0) this.setPaused(false);
    else if (this.net) {
      this.leaving = true;
      this.net.client.close();
      this.scene.start('Online', { message: 'VOCÊ SAIU DA PARTIDA' });
    } else if (this.pauseCursor === 1) this.scene.restart(this.setup);
    else if (this.pauseCursor === 2) this.scene.start('Select', { setup: this.setup });
    else this.scene.start('Title');
  }

  // ── End ─────────────────────────────────────────────────────────────────────

  private finish(): void {
    this.leaving = true;
    const s = this.sim.state;
    const data: ResultsData = {
      setup: this.setup,
      winnerTeam: s.match.winnerTeam ?? -1,
      durationTicks: s.match.endTick,
      fighters: s.fighters.map((f, i) => ({
        label: this.setup.slots[i].label,
        characterId: f.characterId,
        color: this.setup.slots[i].color,
        team: f.team,
        stats: f.stats,
        stocks: f.stocks,
      })),
    };
    this.cameras.main.fadeOut(300, 26, 20, 34);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Results', data));
  }
}
