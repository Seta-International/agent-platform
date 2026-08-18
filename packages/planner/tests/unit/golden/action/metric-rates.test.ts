// Design D3: the A2 lane gates on a pass RATE per metric.
//
// The two mistakes this test exists to prevent: reporting a metric no case claimed as
// 0/0 (which reads as a broken agent), and gating on an advisory metric (which turns a
// diagnostic into a blocker).
import { expect, it } from 'vitest';
import {
  assertMetricThresholds,
  metricRates,
} from '../../../fixtures/golden/action/metric-rates.ts';
import { ACTION_CONFIG_URL } from '../../../fixtures/golden/metric-policy.ts';

const report = {
  cases: [
    { id: 'MU-001', policies: [{ id: 'M1', mode: 'gate', verdict: 'pass', scorers: [] }] },
    { id: 'MU-002', policies: [{ id: 'M1', mode: 'gate', verdict: 'fail', scorers: [] }] },
    { id: 'MU-003', policies: [{ id: 'M3', mode: 'gate', verdict: 'pass', scorers: [] }] },
  ],
} as never;

it('computes a rate per metric over the cases that CLAIMED it', () => {
  const rates = metricRates(report, ACTION_CONFIG_URL);
  const m1 = rates.find((r) => r.id === 'M1')!;
  expect(m1.evaluated).toBe(2);
  expect(m1.passed).toBe(1);
  expect(m1.rate).toBe(0.5);
  expect(m1.threshold).toBe(0.9);
  expect(m1.missedCases).toEqual(['MU-002']);
  // A metric no case claimed is ABSENT, not 0 — reporting 0/0 as a failure would
  // make an unauthored metric look like a broken agent.
  expect(rates.find((r) => r.id === 'M7')).toBeUndefined();
});

it('fails the run when a gate metric is below its threshold, naming the cases', () => {
  expect(() => assertMetricThresholds(report, ACTION_CONFIG_URL)).toThrow(/M1 0\.50 < 0\.90/);
  expect(() => assertMetricThresholds(report, ACTION_CONFIG_URL)).toThrow(/MU-002/);
});

it('passes when every gate metric meets its threshold', () => {
  const green = {
    cases: [{ id: 'MU-003', policies: [{ id: 'M3', mode: 'gate', verdict: 'pass', scorers: [] }] }],
  } as never;
  expect(() => assertMetricThresholds(green, ACTION_CONFIG_URL)).not.toThrow();
});

it('never gates on an advisory metric, however badly it scored', () => {
  const advisory = {
    cases: [
      { id: 'MU-001', policies: [{ id: 'B1', mode: 'advisory', verdict: 'fail', scorers: [] }] },
    ],
  } as never;
  expect(() => assertMetricThresholds(advisory, ACTION_CONFIG_URL)).not.toThrow();
});
