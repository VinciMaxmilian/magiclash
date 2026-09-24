/**
 * Procedural chiptune music (original compositions, no audio files): a tiny step sequencer that
 * schedules Web Audio oscillators slightly ahead of time on the music bus.
 *
 * Notation: one token per 8th note. `A4`/`C#5`/`Bb4` start a note, `-` holds the previous
 * one, `.` is a rest. Chords are written per bar as root + quality.
 */

export type TrackId = 'title' | 'battle';

interface Track {
  bpm: number;
  /** One string per bar (8 tokens). */
  lead: string[];
  /** One chord per bar, e.g. `A:m`, `F:M`, `E:M`. */
  chords: string[];
  bassStyle: 'walk' | 'drive';
  drums: boolean;
  leadGain: number;
}

const TRACKS: Record<TrackId, Track> = {
  // Calm lute-like theme in A minor for menus.
  title: {
    bpm: 88,
    lead: [
      'A4 - C5 - E5 - D5 C5',
      'C5 - A4 - F4 - A4 -',
      'B4 - D5 - G5 - F5 D5',
      'E5 - - - B4 - . .',
      'A4 - E5 - A5 - G5 E5',
      'F5 - E5 - C5 - A4 -',
      'D5 - B4 - G4 - B4 D5',
      'E5 - D5 - B4 - G#4 -',
    ],
    chords: ['A:m', 'F:M', 'G:M', 'E:m', 'A:m', 'F:M', 'G:M', 'E:M'],
    bassStyle: 'walk',
    drums: false,
    leadGain: 0.05,
  },
  // Driving battle theme in D minor.
  battle: {
    bpm: 138,
    lead: [
      'D5 - F5 - A5 - F5 -',
      'E5 D5 C5 - D5 - . .',
      'D5 - F5 - Bb5 - A5 G5',
      'E5 - G5 - C6 - . .',
      'A5 - G5 F5 E5 - D5 -',
      'F5 - E5 D5 C#5 - D5 -',
      'F5 - D5 - Bb4 - D5 F5',
      'E5 - C#5 - A4 - . .',
    ],
    chords: ['D:m', 'D:m', 'Bb:M', 'C:M', 'D:m', 'D:m', 'Bb:M', 'A:M'],
    bassStyle: 'drive',
    drums: true,
    leadGain: 0.045,
  },
};

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** `A4` → MIDI 69. */
export const midi = (name: string): number => {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return NOTE_INDEX[m[1]] + acc + (Number(m[3]) + 1) * 12;
};

const freq = (n: number) => 440 * 2 ** ((n - 69) / 12);

export interface NoteEvent {
  /** In 16th steps from the start of the loop. */
  step: number;
  /** In 16th steps. */
  len: number;
  note: number;
  voice: 'lead' | 'bass' | 'arp' | 'kick' | 'snare' | 'hat';
}

/** Expands a track into one loop of note events (pure: unit-tested). */
export const compile = (id: TrackId): { events: NoteEvent[]; steps: number; stepSec: number } => {
  const t = TRACKS[id];
  const events: NoteEvent[] = [];
  t.lead.forEach((bar, b) => {
    const tokens = bar.trim().split(/\s+/);
    if (tokens.length !== 8) throw new Error(`${id} bar ${b}: expected 8 tokens`);
    tokens.forEach((tok, i) => {
      const step = b * 16 + i * 2;
      if (tok === '-') {
        const last = [...events].reverse().find((e) => e.voice === 'lead');
        if (last && last.step + last.len === step) last.len += 2;
      } else if (tok !== '.') {
        events.push({ step, len: 2, note: midi(tok), voice: 'lead' });
      }
    });
  });
  t.chords.forEach((chord, b) => {
    const [rootName, quality] = chord.split(':');
    const root = midi(`${rootName}2`);
    const third = quality === 'm' ? 3 : 4;
    const tones = [0, third, 7, 12];
    const bar = b * 16;
    if (t.bassStyle === 'walk') {
      [0, 7, 12, 7].forEach((iv, q) => events.push({ step: bar + q * 4, len: 3, note: root + iv, voice: 'bass' }));
    } else {
      for (let e = 0; e < 8; e++) events.push({ step: bar + e * 2, len: 1, note: root + (e % 2 ? 12 : 0), voice: 'bass' });
    }
    for (let s = 0; s < 16; s++) {
      events.push({ step: bar + s, len: 1, note: root + 24 + tones[s % 4], voice: 'arp' });
    }
    if (t.drums) {
      for (const s of [0, 6, 8]) events.push({ step: bar + s, len: 1, note: 0, voice: 'kick' });
      for (const s of [4, 12]) events.push({ step: bar + s, len: 1, note: 0, voice: 'snare' });
      for (let s = 2; s < 16; s += 4) events.push({ step: bar + s, len: 1, note: 0, voice: 'hat' });
    }
  });
  events.sort((a, b) => a.step - b.step);
  return { events, steps: t.lead.length * 16, stepSec: 60 / t.bpm / 4 };
};

const LOOKAHEAD_SEC = 0.15;

/** Plays one looping track on `out`. Stop with `stop()` (short fade, no clicks). */
export class MusicPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly bus: GainNode;
  private startAt = 0;
  private loopIndex = 0;
  private cursor = 0;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly noise: AudioBuffer,
    readonly track: TrackId,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
    this.bus.connect(out);
    const song = compile(track);
    this.startAt = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(song), 30);
    this.schedule(song);
  }

  private schedule(song: ReturnType<typeof compile>) {
    const now = this.ctx.currentTime;
    const loopSec = song.steps * song.stepSec;
    for (;;) {
      if (this.cursor >= song.events.length) {
        this.cursor = 0;
        this.loopIndex++;
      }
      const e = song.events[this.cursor];
      const at = this.startAt + this.loopIndex * loopSec + e.step * song.stepSec;
      if (at > now + LOOKAHEAD_SEC) return;
      this.cursor++;
      // A throttled background tab can fall behind: skip what's already late instead of bursting.
      if (at < now - 0.05) continue;
      this.voice(e, at, e.len * song.stepSec);
    }
  }

  private voice(e: NoteEvent, at: number, dur: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(this.bus);
    const env = (peak: number, attack: number, release: number, sustain = 0.7) => {
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + attack);
      g.gain.setTargetAtTime(peak * sustain, at + attack, 0.08);
      g.gain.setTargetAtTime(0, at + Math.max(attack, dur - release), release / 3);
    };
    if (e.voice === 'kick' || e.voice === 'snare' || e.voice === 'hat') {
      if (e.voice === 'kick') {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(130, at);
        o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
        g.gain.setValueAtTime(0.22, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
        o.connect(g);
        o.start(at);
        o.stop(at + 0.18);
      } else {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = e.voice === 'hat' ? 'highpass' : 'bandpass';
        f.frequency.value = e.voice === 'hat' ? 7000 : 1800;
        const len = e.voice === 'hat' ? 0.03 : 0.1;
        g.gain.setValueAtTime(e.voice === 'hat' ? 0.03 : 0.07, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + len);
        src.connect(f).connect(g);
        src.start(at, Math.random() * 0.5, len + 0.02);
      }
      return;
    }
    const o = ctx.createOscillator();
    o.frequency.value = freq(e.note);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    if (e.voice === 'lead') {
      o.type = 'square';
      lp.frequency.value = 2600;
      env(TRACKS[this.track].leadGain, 0.01, 0.06);
      // light vibrato on long notes
      if (dur > 0.3) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = 5.5;
        depth.gain.setValueAtTime(0, at);
        depth.gain.linearRampToValueAtTime(freq(e.note) * 0.006, at + 0.25);
        lfo.connect(depth).connect(o.frequency);
        lfo.start(at);
        lfo.stop(at + dur + 0.1);
      }
    } else if (e.voice === 'bass') {
      o.type = 'triangle';
      lp.frequency.value = 900;
      env(0.16, 0.005, 0.04, 0.8);
    } else {
      o.type = 'square';
      lp.frequency.value = 1400;
      env(0.012, 0.003, 0.03, 0.4);
    }
    o.connect(lp).connect(g);
    o.start(at);
    o.stop(at + dur + 0.2);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0, t, 0.15);
    setTimeout(() => this.bus.disconnect(), 1200);
  }
}
