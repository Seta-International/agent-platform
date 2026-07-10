import { describe, expect, it } from 'vitest';
import { ALLOCATION_HIDEABLE_COLUMNS } from '../../src/pages/allocation-page.tsx';

describe('ALLOCATION_HIDEABLE_COLUMNS', () => {
  it('uses plain string labels for every toggle entry (not JSX header functions)', () => {
    expect(ALLOCATION_HIDEABLE_COLUMNS.length).toBeGreaterThan(0);
    for (const col of ALLOCATION_HIDEABLE_COLUMNS) {
      expect(typeof col.label).toBe('string');
      expect(col.label.length).toBeGreaterThan(0);
      expect(col.label).not.toMatch(/jsxDEV|_jsx|className/);
    }
  });

  it('includes month columns Jan–Dec and MM', () => {
    const labels = ALLOCATION_HIDEABLE_COLUMNS.map((c) => c.label);
    expect(labels).toContain('Jan');
    expect(labels).toContain('Dec');
    expect(labels).toContain('MM');
  });
});
