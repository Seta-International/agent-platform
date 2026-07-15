import type { RegressionReport } from '@seta/core/agent-eval';
import { describe, expect, it } from 'vitest';
import { formatRegressionReport } from '../../src/commands/eval-quality.ts';

describe('formatRegressionReport', () => {
  it('renders flagged drops with baseline → current', () => {
    const report: RegressionReport = {
      regressions: [
        {
          specialistId: 'taskQuery',
          scorerId: 'faithfulness',
          current: 0.68,
          baseline: 0.82,
          drop: 0.14,
        },
      ],
      insufficient: [],
    };
    const out = formatRegressionReport(report, 5);
    expect(out).toContain('Quality regression vs baseline');
    expect(out).toContain('taskQuery');
    expect(out).toContain('faithfulness');
    expect(out).toContain('0.82');
    expect(out).toContain('0.68');
  });

  it('states no regressions when the list is empty', () => {
    const out = formatRegressionReport({ regressions: [], insufficient: [] }, 5);
    expect(out).toMatch(/no regressions/i);
  });

  it('notes keys with insufficient baseline', () => {
    const out = formatRegressionReport(
      { regressions: [], insufficient: [{ specialistId: 'newSpec', scorerId: 'toxicity' }] },
      5,
    );
    expect(out).toMatch(/insufficient baseline/i);
    expect(out).toContain('newSpec');
  });
});
