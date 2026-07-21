import { expect, it } from 'vitest';
import { GoldenCaseSchema } from '../../fixtures/golden/schema.ts';

it('accepts a valid agent case', () => {
  const parsed = GoldenCaseSchema.parse({
    schemaVersion: 1,
    kind: 'agent',
    id: 'PQ-FACT-001',
    category: 'factual',
    suites: ['smoke', 'regression'],
    holdout: false,
    actor: { tenantId: 'tenant-golden-main', userId: 'actor-standard-001' },
    input: { messages: [{ role: 'user', content: 'Tuan?' }] },
    expected: {
      behavior: 'answer',
      facts: [{ ref: 'facts.users.user-tuan.openTaskCount', assertion: 'equals' }],
    },
    metrics: { enabled: ['A1', 'B1'] },
  });
  expect(parsed.kind).toBe('agent');
});

it('rejects a case-level expected on a conversation case', () => {
  expect(() =>
    GoldenCaseSchema.parse({
      schemaVersion: 1,
      kind: 'conversation',
      id: 'PQ-CONV-001',
      suites: ['nightly'],
      holdout: false,
      actor: { tenantId: 't', userId: 'u' },
      expected: { behavior: 'answer' }, // illegal for conversation
    }),
  ).toThrow();
});

it('rejects suites as a bare string (must be an array)', () => {
  expect(() =>
    GoldenCaseSchema.parse({
      schemaVersion: 1,
      kind: 'agent',
      id: 'x',
      suites: 'smoke',
      holdout: false,
      actor: { tenantId: 't', userId: 'u' },
      input: { messages: [] },
      expected: { behavior: 'answer' },
      metrics: { enabled: [] },
    }),
  ).toThrow();
});
