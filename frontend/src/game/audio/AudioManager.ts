import { SFX, type SfxId } from './sfx';

export type Bus = 'music' | 'sfx' | 'ui' | 'ambient';

/**
 * Separate buses: master → music / sfx / ui / ambient. Settings control master, music and
 * sfx (ui + ambient follow sfx). The AudioContext is created on the first user gesture
 * (browser autoplay policy); calls before that are silently ignored.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<Bus, GainNode>;
  private noise!: AudioBuffer;
  private ambientNode: AudioBufferSourceNode | null = null;
  private ambientLfo: OscillatorNode | null = null;
  private volumes = { master: 0.8, music: 0.6, sfx: 0.9 };
  private lastPlayed = new Map<SfxId, number>();

  constructor() {
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  private ensure(): boolean {
    if (this.ctx) return true;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    try {
      this.ctx = new Ctor();
    } catch {
      return false;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    // Gentle limiter so stacked impacts never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    this.buses = {
      music: ctx.createGain(),
      sfx: ctx.createGain(),
      ui: ctx.createGain(),
      ambient: ctx.createGain(),
    };
    Object.values(this.buses).forEach((b) => b.connect(this.master));
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    return true;
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.volumes = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.02);
    this.buses.music.gain.setTargetAtTime(this.volumes.music, t, 0.02);
    this.buses.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.02);
    this.buses.ui.gain.setTargetAtTime(this.volumes.sfx * 0.8, t, 0.02);
    this.buses.ambient.gain.setTargetAtTime(this.volumes.sfx * 0.5, t, 0.02);
  }

  /** `pitch` ~1 (random ±5% added for variety). Rapid repeats of the same id are throttled. */
  play(id: SfxId, bus: Bus = 'sfx', pitch = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const synth = SFX[id];
    if (!synth) return; // unknown id from data: silent rather than crashing the frame
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(id) ?? -1) < 0.03) return;
    this.lastPlayed.set(id, now);
    synth(this.ctx, this.buses[bus], this.noise, now, pitch * (0.95 + Math.random() * 0.1));
  }

  /** Low wind bed for stage ambience. */
  startAmbient(): void {
    if (!this.ensure() || !this.ctx || this.ambientNode) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = this.ctx.createGain();
    g.gain.value = 0.08;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.12;
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(lp.frequency);
    src.connect(lp).connect(g).connect(this.buses.ambient);
    src.start();
    lfo.start();
    this.ambientNode = src;
    this.ambientLfo = lfo;
  }

  stopAmbient(): void {
    for (const n of [this.ambientNode, this.ambientLfo]) {
      try {
        n?.stop();
      } catch {
        /* already stopped */
      }
    }
    this.ambientNode = null;
    this.ambientLfo = null;
  }
}
