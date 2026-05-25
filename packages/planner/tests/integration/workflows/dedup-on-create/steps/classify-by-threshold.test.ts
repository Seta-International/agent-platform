import { describe, expect, it } from 'vitest';
import {
  classifyByThreshold,
  toDistance,
} from '../../../../../src/backend/workflows/dedup-on-create/steps/classify-by-threshold.ts';

const THRESHOLDS = { likelyDup: 0.18, maybeDup: 0.3 };

describe('classifyByThreshold', () => {
  it('classifies score >= 0.82 as likely-dup (distance < 0.18)', () => {
    const out = classifyByThreshold(
      { candidates: [{ taskId: 't1', title: 'x', score: 0.85, status: 'open' }] },
      THRESHOLDS,
    );
    expect(out.classification).toBe('likely-dup');
  });

  it('classifies score in (0.70, 0.82] as maybe-dup (distance in [0.18, 0.30))', () => {
    const out = classifyByThreshold(
      { candidates: [{ taskId: 't1', title: 'x', score: 0.75, status: 'open' }] },
      THRESHOLDS,
    );
    expect(out.classification).toBe('maybe-dup');
  });

  it('classifies score < 0.70 as no-match (distance >= 0.30)', () => {
    const out = classifyByThreshold(
      { candidates: [{ taskId: 't1', title: 'x', score: 0.5, status: 'open' }] },
      THRESHOLDS,
    );
    expect(out.classification).toBe('no-match');
  });

  it('returns no-match on empty candidates', () => {
    const out = classifyByThreshold({ candidates: [] }, THRESHOLDS);
    expect(out.classification).toBe('no-match');
    expect(out.top).toEqual([]);
  });

  it('caps top at 5 candidates', () => {
    const candidates = Array.from({ length: 8 }, (_, i) => ({
      taskId: `t${i}`,
      title: `t${i}`,
      score: 0.5,
      status: 'open',
    }));
    const out = classifyByThreshold({ candidates }, THRESHOLDS);
    expect(out.top).toHaveLength(5);
  });

  it('toDistance is 1 - score', () => {
    expect(toDistance(0.85)).toBeCloseTo(0.15);
    expect(toDistance(0)).toBe(1);
    expect(toDistance(1)).toBe(0);
  });
});
