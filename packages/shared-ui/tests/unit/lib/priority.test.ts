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

  it('every level carries a label and color/tint/ink from its priority token', () => {
    for (const p of PRIORITY_LEVELS) {
      expect(p.label, `label for ${p.level}`).toBeTruthy();
      expect(p.color, `color for ${p.level}`).toContain(`--color-priority-${p.level}`);
      expect(p.tint, `tint for ${p.level}`).toContain(`--color-priority-${p.level}`);
      expect(p.ink, `ink for ${p.level}`).toContain(`--color-priority-${p.level}`);
    }
  });

  it('value/level lookup maps stay in sync with the registry', () => {
    for (const p of PRIORITY_LEVELS) {
      expect(PRIORITY_BY_VALUE[p.value]).toBe(p);
      expect(PRIORITY_BY_LEVEL[p.level]).toBe(p);
    }
  });
});
