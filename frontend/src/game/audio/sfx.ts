/**
 * Synthesized placeholder SFX (WebAudio). No audio files yet: every sound is built from
 * noise/oscillators + envelopes so the mix, buses and event hooks can be tuned now and
 * real recordings dropped in later with the same ids.
 */

export type SfxId =
  | 'sword_light'
  | 'sword_heavy'
  | 'hit_light'
  | 'hit_heavy'
  | 'ko'
  | 'jump'
  | 'jump_air'
  | 'land'
  | 'dodge'
  | 'bounce'
  | 'respawn'
  | 'ui_move'
  | 'ui_confirm'
  | 'ui_back'
  | 'countdown'
  | 'go';

type Synth = (ctx: AudioContext, out: AudioNode, noise: AudioBuffer, t: number, pitch: number) => void;

const env = (ctx: AudioContext, out: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode => {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
};

const noiseBurst = (
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  opts: { type: BiquadFilterType; from: number; to: number; q?: number; peak: number; attack: number; decay: number },
) => {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = opts.type;
  f.Q.value = opts.q ?? 1;
  f.frequency.setValueAtTime(opts.from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + opts.attack + opts.decay);
  src.connect(f).connect(env(ctx, out, t, opts.peak, opts.attack, opts.decay));
  src.start(t, Math.random() * 0.5);
  src.stop(t + opts.attack + opts.decay + 0.05);
};

const tone = (
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  opts: { type: OscillatorType; from: number; to: number; peak: number; attack: number; decay: number },
) => {
  const o = ctx.createOscillator();
  o.type = opts.type;
  o.frequency.setValueAtTime(opts.from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + opts.attack + opts.decay);
  o.connect(env(ctx, out, t, opts.peak, opts.attack, opts.decay));
  o.start(t);
  o.stop(t + opts.attack + opts.decay + 0.05);
};

export const SFX: Record<SfxId, Synth> = {
  sword_light: (c, o, n, t, p) =>
    noiseBurst(c, o, n, t, { type: 'bandpass', from: 2600 * p, to: 700 * p, q: 1.4, peak: 0.45, attack: 0.01, decay: 0.09 }),
  sword_heavy: (c, o, n, t, p) => {
    noiseBurst(c, o, n, t, { type: 'bandpass', from: 1600 * p, to: 260 * p, q: 1.1, peak: 0.6, attack: 0.02, decay: 0.2 });
    tone(c, o, t, { type: 'sine', from: 120 * p, to: 60, peak: 0.2, attack: 0.01, decay: 0.15 });
  },
  hit_light: (c, o, n, t, p) => {
    noiseBurst(c, o, n, t, { type: 'lowpass', from: 3000 * p, to: 600, peak: 0.5, attack: 0.002, decay: 0.06 });
    tone(c, o, t, { type: 'triangle', from: 260 * p, to: 90, peak: 0.35, attack: 0.002, decay: 0.08 });
  },
  hit_heavy: (c, o, n, t, p) => {
    noiseBurst(c, o, n, t, { type: 'lowpass', from: 2200 * p, to: 200, peak: 0.8, attack: 0.002, decay: 0.16 });
    tone(c, o, t, { type: 'sine', from: 160 * p, to: 38, peak: 0.7, attack: 0.002, decay: 0.24 });
    tone(c, o, t, { type: 'square', from: 70 * p, to: 40, peak: 0.12, attack: 0.002, decay: 0.1 });
  },
  ko: (c, o, n, t) => {
    noiseBurst(c, o, n, t, { type: 'lowpass', from: 1800, to: 80, peak: 0.9, attack: 0.005, decay: 0.7 });
    tone(c, o, t, { type: 'sine', from: 90, to: 28, peak: 0.8, attack: 0.005, decay: 0.7 });
    tone(c, o, t + 0.02, { type: 'triangle', from: 1320, to: 1100, peak: 0.12, attack: 0.005, decay: 0.5 });
  },
  jump: (c, o, _n, t, p) => tone(c, o, t, { type: 'square', from: 260 * p, to: 520 * p, peak: 0.07, attack: 0.005, decay: 0.07 }),
  jump_air: (c, o, n, t, p) => {
    tone(c, o, t, { type: 'square', from: 380 * p, to: 720 * p, peak: 0.06, attack: 0.005, decay: 0.07 });
    noiseBurst(c, o, n, t, { type: 'highpass', from: 2500, to: 5000, peak: 0.08, attack: 0.005, decay: 0.08 });
  },
  land: (c, o, n, t, p) =>
    noiseBurst(c, o, n, t, { type: 'lowpass', from: 700 * p, to: 120, peak: 0.25, attack: 0.003, decay: 0.07 }),
  dodge: (c, o, n, t, p) =>
    noiseBurst(c, o, n, t, { type: 'highpass', from: 1500 * p, to: 6000 * p, peak: 0.18, attack: 0.02, decay: 0.12 }),
  bounce: (c, o, n, t) => {
    noiseBurst(c, o, n, t, { type: 'lowpass', from: 900, to: 90, peak: 0.5, attack: 0.002, decay: 0.12 });
    tone(c, o, t, { type: 'sine', from: 110, to: 45, peak: 0.4, attack: 0.002, decay: 0.12 });
  },
  respawn: (c, o, _n, t) => {
    [523, 659, 784].forEach((f, i) =>
      tone(c, o, t + i * 0.06, { type: 'triangle', from: f, to: f, peak: 0.1, attack: 0.005, decay: 0.12 }),
    );
  },
  ui_move: (c, o, _n, t) => tone(c, o, t, { type: 'square', from: 660, to: 660, peak: 0.05, attack: 0.002, decay: 0.03 }),
  ui_confirm: (c, o, _n, t) => {
    tone(c, o, t, { type: 'square', from: 523, to: 523, peak: 0.07, attack: 0.002, decay: 0.05 });
    tone(c, o, t + 0.06, { type: 'square', from: 784, to: 784, peak: 0.07, attack: 0.002, decay: 0.08 });
  },
  ui_back: (c, o, _n, t) => tone(c, o, t, { type: 'square', from: 420, to: 260, peak: 0.06, attack: 0.002, decay: 0.08 }),
  countdown: (c, o, _n, t) => tone(c, o, t, { type: 'square', from: 440, to: 440, peak: 0.08, attack: 0.003, decay: 0.12 }),
  go: (c, o, _n, t) => {
    tone(c, o, t, { type: 'square', from: 880, to: 880, peak: 0.09, attack: 0.003, decay: 0.3 });
    tone(c, o, t, { type: 'square', from: 660, to: 660, peak: 0.06, attack: 0.003, decay: 0.3 });
  },
};
