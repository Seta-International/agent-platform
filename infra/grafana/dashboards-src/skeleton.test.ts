import { describe, expect, it } from 'vitest';
import { board, gaugeTile, prom, statTile, trend } from './skeleton';
import { SLO, stepsAsc, UNIT } from './tokens';

describe('skeleton', () => {
  it('board sets uid, tag, refresh', () => {
    const d = board('App Service', 'app-service').build();
    expect(d.uid).toBe('app-service');
    expect(d.tags).toContain('generated');
    expect(d.refresh).toBeDefined();
  });

  it('statTile carries title, unit, threshold steps and a Prometheus target', () => {
    const p = statTile({
      title: '5xx error ratio',
      expr: 'sum(rate(http_server_duration_count{http_status_code=~"5.."}[5m]))',
      unit: UNIT.percent,
      steps: stepsAsc(SLO.httpErrorRatioPct.warn, SLO.httpErrorRatioPct.crit),
      description: 'Share of 5xx. SLO < 1%.',
    }).build();
    expect(p.title).toBe('5xx error ratio');
    expect(p.fieldConfig?.defaults?.unit).toBe('percent');
    expect(p.fieldConfig?.defaults?.thresholds?.steps?.length).toBe(3);
    expect(JSON.stringify(p.targets)).toContain('http_server_duration_count');
  });

  it('trend attaches all targets and an SLO threshold line when softMax given', () => {
    const p = trend({
      title: 'p95 latency',
      unit: UNIT.ms,
      targets: [prom('histogram_quantile(0.95, x)', 'p95')],
      description: 'SLO < 500ms',
      softMax: 500,
    }).build();
    expect(p.title).toBe('p95 latency');
    expect(p.targets?.length).toBe(1);
  });

  it('gaugeTile clamps 0..100 for saturation', () => {
    const p = gaugeTile({
      title: 'CPU busy',
      expr: 'x',
      unit: UNIT.percent,
      steps: stepsAsc(80, 90),
      min: 0,
      max: 100,
      description: 'd',
    }).build();
    expect(p.fieldConfig?.defaults?.max).toBe(100);
  });
});
