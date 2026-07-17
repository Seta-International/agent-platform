import { describe, expect, it } from 'vitest';
import { PRIORITY_BY_LEVEL, PRIORITY_BY_VALUE, PRIORITY_LEVELS } from '../../../src/lib/priority';

// Guardrail for the priority single-source-of-truth. Every priority swatch in
// the app composes its color from this registry; if a level here ever loses its
// color token, dots/icons render blank — the FUT-20/FUT-21 class of bug.
describe('priority registry', () => {
  it('defines the four levels in order with their stored values', () => {
    expect(PRIORITY_LEVELS.map((p) => p.level)).toEqual(['urgent', 'important', 'medium', 'low']);
    expect(PRIORITY_LEVELS.map((p) => p.value)).toEqual([1, 3, 5, 9]);
  });

  // Each level owns a hue, and the three roles must all come from that same hue —
  // mixing them is what makes a chip unreadable against its own tint.
  const HUE: Record<string, string> = {
    urgent: 'red',
    important: 'orange',
    medium: 'blue',
    low: 'gray',
  };

  it('every level carries a label and color/tint/ink from a single Astryx hue', () => {
    for (const p of PRIORITY_LEVELS) {
      const hue = HUE[p.level];
      expect(p.label, `label for ${p.level}`).toBeTruthy();
      expect(p.color, `color for ${p.level}`).toBe(`var(--color-icon-${hue})`);
      expect(p.tint, `tint for ${p.level}`).toBe(`var(--color-background-${hue})`);
      expect(p.ink, `ink for ${p.level}`).toBe(`var(--color-text-${hue})`);
    }
  });

  it('value/level lookup maps stay in sync with the registry', () => {
    for (const p of PRIORITY_LEVELS) {
      expect(PRIORITY_BY_VALUE[p.value]).toBe(p);
      expect(PRIORITY_BY_LEVEL[p.level]).toBe(p);
    }
  });
});
