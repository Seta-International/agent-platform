import { describe, expect, it } from 'vitest';
import { KPI_NORM_METRICS } from '../../src/backend/domain/kpi-norm-data.ts';
import {
  computeEntryStatus,
  computeScoredValue,
  figuresForStatus,
  kpiValuePrecision,
  type RagStatus,
} from '../../src/contracts.ts';

const STATUSES: RagStatus[] = ['green', 'yellow', 'red'];

function scoreOf(
  metric: (typeof KPI_NORM_METRICS)[number],
  figures: NonNullable<ReturnType<typeof figuresForStatus>>,
) {
  const precision = kpiValuePrecision(metric.green_band, metric.yellow_band, metric.red_band);
  const value = computeScoredValue(
    metric.component_count,
    figures.component_1_value,
    figures.component_2_value,
    precision,
  );
  return computeEntryStatus(value, metric.green_band, metric.yellow_band, metric.red_band);
}

describe('figuresForStatus — against the shipped KPI Norm catalogue', () => {
  it('reaches every band of every metric', () => {
    const unreachable: string[] = [];
    for (const metric of KPI_NORM_METRICS) {
      for (const target of STATUSES) {
        if (figuresForStatus(metric, target) === null) {
          unreachable.push(`${metric.name} → ${target}`);
        }
      }
    }
    expect(unreachable).toEqual([]);
  });

  it('returns figures that actually score to the band asked for', () => {
    for (const metric of KPI_NORM_METRICS) {
      for (const target of STATUSES) {
        const figures = figuresForStatus(metric, target);
        if (!figures) continue;
        expect(scoreOf(metric, figures), `${metric.name} → ${target}`).toBe(target);
      }
    }
  });

  it('keeps a share metric inside its own denominator', () => {
    for (const metric of KPI_NORM_METRICS.filter((m) => m.is_share)) {
      for (const target of STATUSES) {
        const figures = figuresForStatus(metric, target);
        if (!figures || figures.component_2_value === null) continue;
        expect(figures.component_1_value, metric.name).toBeLessThanOrEqual(
          figures.component_2_value,
        );
      }
    }
  });

  it('respects integer-only components', () => {
    for (const metric of KPI_NORM_METRICS.filter((m) => m.component_1_integer)) {
      for (const target of STATUSES) {
        const figures = figuresForStatus(metric, target);
        if (!figures) continue;
        expect(Number.isInteger(figures.component_1_value), metric.name).toBe(true);
      }
    }
  });
});
