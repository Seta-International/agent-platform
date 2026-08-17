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

it('accepts the A2 write terminal behaviours confirm and applied', () => {
  const base = {
    schemaVersion: 1 as const,
    kind: 'conversation' as const,
    id: 'RV-SCHEMA-PROBE',
    suites: ['regression' as const],
    actor: { tenantId: 't', userId: 'u' },
  };
  for (const behavior of ['confirm', 'applied'] as const) {
    const parsed = GoldenCaseSchema.parse({
      ...base,
      turns: [{ user: 'đổi due date sang 19/8', expected: { behavior } }],
    });
    expect(parsed.kind).toBe('conversation');
  }
});

it('still rejects an unknown behaviour', () => {
  expect(() =>
    GoldenCaseSchema.parse({
      schemaVersion: 1,
      kind: 'conversation',
      id: 'RV-SCHEMA-PROBE-2',
      suites: ['regression'],
      actor: { tenantId: 't', userId: 'u' },
      turns: [{ user: 'x', expected: { behavior: 'previewed' } }],
    }),
  ).toThrow();
});
