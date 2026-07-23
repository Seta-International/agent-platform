import { expect, it } from 'vitest';
import { buildRunManifest } from '../../fixtures/golden/run-manifest.ts';

it('captures the reproducibility fields from dataset.json + overrides', () => {
  const m = buildRunManifest({
    agentVersion: 'a1',
    promptVersion: 'p1',
    productionModelVersion: 'claude-x',
    judgeModelVersion: 'claude-sonnet-4-20250514',
    harnessVersion: 'phase-2a',
  });
  expect(m.seedChecksum).toMatch(/^[0-9a-f]{64}$/);
  expect(m.datasetVersion).toBe('2.0.0');
  expect(m.embeddingModelVersion).toBe('openai:text-embedding-3-small');
  expect(m.judgeModelVersion).toBe('claude-sonnet-4-20250514');
});
