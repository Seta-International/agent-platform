import { describe, expect, it } from 'vitest';
import { bubbleGroup, dateDividerLabel } from '../../../src/chat-experience/transcript-structure';

// Dividers are keyed to the viewer's LOCAL calendar day, so fixtures are built
// with the local-time Date constructor (year, monthIndex, day, hour) — this
// keeps the day-boundary assertions deterministic in any runner timezone,
// where a UTC-ISO string near midnight would flip days between UTC and UTC+7.
const NOW = new Date(2026, 6, 18, 12); // local Jul 18 2026, noon
const day = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h);

describe('dateDividerLabel', () => {
  it('labels the first message (no previous) with its day', () => {
    expect(dateDividerLabel(day(2026, 4, 20), undefined, NOW)).toBe('May 20, 2026');
  });

  it('returns null when the previous message is the same local day', () => {
    expect(dateDividerLabel(day(2026, 4, 20, 23), day(2026, 4, 20, 1), NOW)).toBeNull();
  });

  it('emits a label once the day changes vs the previous message', () => {
    expect(dateDividerLabel(day(2026, 4, 21, 1), day(2026, 4, 20, 23), NOW)).toBe('May 21, 2026');
  });

  it('uses Today / Yesterday relative to now', () => {
    expect(dateDividerLabel(day(2026, 6, 18, 8), undefined, NOW)).toBe('Today');
    expect(dateDividerLabel(day(2026, 6, 17, 8), undefined, NOW)).toBe('Yesterday');
  });
});

describe('bubbleGroup', () => {
  it('is standalone (undefined) for a lone bubble', () => {
    expect(bubbleGroup(0, 1)).toBeUndefined();
    expect(bubbleGroup(0, 0)).toBeUndefined();
  });

  it('positions a run of adjacent bubbles first / middle / last', () => {
    expect(bubbleGroup(0, 3)).toBe('first');
    expect(bubbleGroup(1, 3)).toBe('middle');
    expect(bubbleGroup(2, 3)).toBe('last');
  });

  it('treats a pair as first then last (no middle)', () => {
    expect(bubbleGroup(0, 2)).toBe('first');
    expect(bubbleGroup(1, 2)).toBe('last');
  });
});
