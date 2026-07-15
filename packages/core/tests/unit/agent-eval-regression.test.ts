import { describe, expect, it } from 'vitest';
import type { BaselineStat, ScoreKeyed } from '../../src/agent-eval/regression.ts';
import { detectRegressions, scoreKey } from '../../src/agent-eval/regression.ts';

const baseline = (entries: [string, string, number, number][]) => {
  const m = new Map<string, BaselineStat>();
  for (const [s, sc, mean, n] of entries) m.set(scoreKey(s, sc), { mean, n });
  return m;
};
const opts = { delta: 0.1, minBaselineRuns: 2 };

describe('detectRegressions', () => {
  it('flags a key whose current score is more than delta below the baseline mean', () => {
    const current: ScoreKeyed[] = [
      { specialistId: 'taskQuery', scorerId: 'faithfulness', score: 0.68 },
    ];
    const r = detectRegressions(current, baseline([['taskQuery', 'faithfulness', 0.82, 5]]), opts);
    expect(r.regressions).toEqual([
      {
        specialistId: 'taskQuery',
        scorerId: 'faithfulness',
        current: 0.68,
        baseline: 0.82,
        drop: expect.closeTo(0.14, 5),
      },
    ]);
    expect(r.insufficient).toEqual([]);
  });

  it('does NOT flag when the drop equals exactly the delta (boundary)', () => {
    const current: ScoreKeyed[] = [{ specialistId: 'a', scorerId: 'x', score: 0.7 }];
    const r = detectRegressions(current, baseline([['a', 'x', 0.8, 3]]), opts);
    expect(r.regressions).toEqual([]);
  });

  it('does NOT flag a small dip within delta', () => {
    const current: ScoreKeyed[] = [{ specialistId: 'a', scorerId: 'x', score: 0.75 }];
    expect(detectRegressions(current, baseline([['a', 'x', 0.8, 3]]), opts).regressions).toEqual(
      [],
    );
  });

  it('reports keys with too few baseline runs as insufficient, never as a drop', () => {
    const current: ScoreKeyed[] = [{ specialistId: 'a', scorerId: 'x', score: 0.1 }];
    const r = detectRegressions(current, baseline([['a', 'x', 0.9, 1]]), opts);
    expect(r.regressions).toEqual([]);
    expect(r.insufficient).toEqual([{ specialistId: 'a', scorerId: 'x' }]);
  });

  it('treats a key absent from the baseline as insufficient', () => {
    const current: ScoreKeyed[] = [{ specialistId: 'new', scorerId: 'x', score: 0.5 }];
    const r = detectRegressions(current, new Map(), opts);
    expect(r.insufficient).toEqual([{ specialistId: 'new', scorerId: 'x' }]);
  });
});
