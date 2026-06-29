import { describe, expect, it } from 'vitest';
import { clampPage } from '../../src/components/people-card-grid.tsx';

describe('clampPage', () => {
  it('clamps below 1 to 1', () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(-3, 5)).toBe(1);
  });

  it('clamps above pageCount to pageCount', () => {
    expect(clampPage(6, 5)).toBe(5);
    expect(clampPage(100, 3)).toBe(3);
  });

  it('returns page unchanged when within bounds', () => {
    expect(clampPage(1, 5)).toBe(1);
    expect(clampPage(3, 5)).toBe(3);
    expect(clampPage(5, 5)).toBe(5);
  });

  it('handles pageCount of 1 (single page)', () => {
    expect(clampPage(0, 1)).toBe(1);
    expect(clampPage(1, 1)).toBe(1);
    expect(clampPage(2, 1)).toBe(1);
  });
});
