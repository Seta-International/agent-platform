import { expect, it } from 'vitest';
import { diffGoldenFacts } from '../../fixtures/golden/oracles/facts-diff.ts';
import type { GoldenFacts } from '../../fixtures/golden/oracles/generate-facts.ts';

const base: GoldenFacts = {
  datasetVersion: '2.0.0',
  referenceTime: '2026-07-01T02:00:00.000Z',
  facts: {
    users: { u1: { openTaskCount: 12, groups: ['g1'], inaccessibleGroups: [] } },
    tasks: { t1: { commentCount: 2, activityCount: 3, groupId: 'g1', tenantId: 'main' } },
  },
};

it('reports no diff for identical facts', () => {
  expect(diffGoldenFacts(base, structuredClone(base))).toEqual([]);
});

it('reports a changed scalar with its dotted path and both values', () => {
  const candidate = structuredClone(base);
  candidate.facts.users.u1 = { openTaskCount: 13, groups: ['g1'], inaccessibleGroups: [] };
  const d = diffGoldenFacts(base, candidate);
  expect(d).toHaveLength(1);
  expect(d[0]).toContain('facts.users.u1.openTaskCount');
  expect(d[0]).toContain('12');
  expect(d[0]).toContain('13');
});

it('reports an added user key as drift', () => {
  const candidate = structuredClone(base);
  candidate.facts.users.u2 = { openTaskCount: 1, groups: [], inaccessibleGroups: [] };
  const d = diffGoldenFacts(base, candidate);
  expect(d.some((x) => x.includes('facts.users.u2'))).toBe(true);
});

it('reports a removed task key as drift', () => {
  const candidate = structuredClone(base);
  delete candidate.facts.tasks.t1;
  const d = diffGoldenFacts(base, candidate);
  expect(d.some((x) => x.includes('facts.tasks.t1'))).toBe(true);
});
