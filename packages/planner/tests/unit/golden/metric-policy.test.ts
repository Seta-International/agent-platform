import { expect, it } from 'vitest';
import { resolveMetricMode } from '../../fixtures/golden/metric-policy.ts';

it('reads gate/advisory from the central registry', () => {
  expect(resolveMetricMode('A1', undefined)).toBe('gate');
  expect(resolveMetricMode('B4', undefined)).toBe('advisory');
});

it('applies a per-case override only when a reason is present', () => {
  expect(resolveMetricMode('B1', { mode: 'advisory', reason: 'Prose-only reference case' })).toBe(
    'advisory',
  );
});
