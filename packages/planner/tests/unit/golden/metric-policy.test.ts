import { expect, it } from 'vitest';
import {
  ACTION_CONFIG_URL,
  resolveMetricMode,
  resolveMetricThreshold,
} from '../../fixtures/golden/metric-policy.ts';

it('reads gate/advisory from the central registry', () => {
  expect(resolveMetricMode('A1', undefined)).toBe('gate');
  expect(resolveMetricMode('B4', undefined)).toBe('advisory');
});

it('applies a per-case override only when a reason is present', () => {
  expect(resolveMetricMode('B1', { mode: 'advisory', reason: 'Prose-only reference case' })).toBe(
    'advisory',
  );
});

it('resolves A2 metric modes from the planner-action config', () => {
  expect(resolveMetricMode('M3', undefined, ACTION_CONFIG_URL)).toBe('gate');
  expect(resolveMetricMode('B1', undefined, ACTION_CONFIG_URL)).toBe('advisory');
});

it('resolves the per-metric pass-rate threshold, defaulting to 1', () => {
  // Requirement-backed metrics tolerate nothing (BR-03, BR-05, EV-08, cancel).
  expect(resolveMetricThreshold('M3', ACTION_CONFIG_URL)).toBe(1);
  expect(resolveMetricThreshold('M4', ACTION_CONFIG_URL)).toBe(1);
  expect(resolveMetricThreshold('M5', ACTION_CONFIG_URL)).toBe(1);
  expect(resolveMetricThreshold('M7', ACTION_CONFIG_URL)).toBe(1);
  // Model-quality metrics carry a provisional rate.
  expect(resolveMetricThreshold('M1', ACTION_CONFIG_URL)).toBe(0.9);
  expect(resolveMetricThreshold('M8', ACTION_CONFIG_URL)).toBe(0.85);
  // A1 metrics declare no threshold: binary gating IS a threshold of 1.
  expect(resolveMetricThreshold('A1')).toBe(1);
});

it('still throws on a metric absent from the config it was asked about', () => {
  expect(() => resolveMetricMode('M1', undefined)).toThrow(/unknown metric/);
  expect(() => resolveMetricMode('A1', undefined, ACTION_CONFIG_URL)).toThrow(/unknown metric/);
});
