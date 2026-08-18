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

it('accepts a three-turn revision case: preview, revise, confirm', () => {
  const parsed = GoldenCaseSchema.parse({
    schemaVersion: 1,
    kind: 'conversation',
    id: 'RV-008',
    suites: ['smoke', 'regression'],
    category: 'revision',
    actor: { tenantId: 'a2-tenant', userId: 'a2-member' },
    fixtures: ['oneTaskDueAug15'],
    turns: [
      {
        user: 'đổi due date của Deploy API sang 15/8',
        expected: {
          behavior: 'confirm',
          trajectory: { requiredTools: ['planner_updateTask'], maxToolCalls: 2 },
          dbEffects: 'none',
        },
      },
      {
        user: 'À thôi đổi sang 19/8 đi',
        expected: {
          behavior: 'confirm',
          trajectory: {
            requiredTools: ['planner_updateTask'],
            argPredicates: [
              {
                tool: 'planner_updateTask',
                path: 'patch.dueAt',
                operator: 'equals',
                value: '2026-08-19',
              },
              { tool: 'planner_updateTask', path: 'correction', operator: 'equals', value: true },
            ],
          },
          output: { forbiddenText: ['yêu cầu mới', 'huỷ đề xuất'] },
          dbEffects: 'none',
        },
      },
      {
        decision: { chosen: 'primary' },
        expected: {
          behavior: 'applied',
          dbEffects: {
            rowsChanged: 1,
            after: [{ table: 'planner.tasks', id: 'fixtures.task', due_at: '2026-08-19' }],
          },
        },
      },
    ],
    metrics: { enabled: ['M8', 'M2', 'M3'] },
  });
  expect(parsed.kind).toBe('conversation');
  if (parsed.kind !== 'conversation') return;
  expect(parsed.turns).toHaveLength(3);
  expect('decision' in parsed.turns[2]!).toBe(true);
});

it('accepts a decline decision and the declined behaviour', () => {
  const parsed = GoldenCaseSchema.parse({
    schemaVersion: 1,
    kind: 'conversation',
    id: 'MU-002',
    suites: ['regression'],
    actor: { tenantId: 'a2-tenant', userId: 'a2-member' },
    turns: [
      { user: 'đổi due date sang 19/8', expected: { behavior: 'confirm', dbEffects: 'none' } },
      { decision: { chosen: 'decline' }, expected: { behavior: 'declined', dbEffects: 'none' } },
    ],
    metrics: { enabled: ['M4'] },
  });
  expect(parsed.kind).toBe('conversation');
});

it('rejects a turn that is both a user message and a decision', () => {
  expect(() =>
    GoldenCaseSchema.parse({
      schemaVersion: 1,
      kind: 'conversation',
      id: 'MU-BAD',
      suites: ['regression'],
      actor: { tenantId: 't', userId: 'u' },
      turns: [{ user: 'x', decision: { chosen: 'primary' }, expected: { behavior: 'confirm' } }],
      metrics: { enabled: ['M3'] },
    }),
  ).toThrow();
});
