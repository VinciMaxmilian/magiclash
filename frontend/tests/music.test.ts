import { describe, expect, it } from 'vitest';
import { compile, midi, type TrackId } from '../src/game/audio/music';

describe('music', () => {
  it('parses note names', () => {
    expect(midi('A4')).toBe(69);
    expect(midi('C#5')).toBe(73);
    expect(midi('Bb4')).toBe(70);
    expect(() => midi('H2')).toThrow();
  });

  it.each(['title', 'battle'] as TrackId[])('%s compiles to a sane loop', (id) => {
    const { events, steps, stepSec } = compile(id);
    expect(steps % 16).toBe(0);
    expect(stepSec).toBeGreaterThan(0.05);
    for (const e of events) {
      expect(e.step).toBeGreaterThanOrEqual(0);
      expect(e.step + e.len).toBeLessThanOrEqual(steps);
      if (!['kick', 'snare', 'hat'].includes(e.voice)) {
        expect(e.note).toBeGreaterThanOrEqual(36);
        expect(e.note).toBeLessThanOrEqual(96);
      }
    }
    const lead = events.filter((e) => e.voice === 'lead');
    expect(lead.length).toBeGreaterThan(20);
    lead.slice(1).forEach((e, i) => expect(e.step).toBeGreaterThanOrEqual(lead[i].step + lead[i].len)); // monophonic
  });
});
