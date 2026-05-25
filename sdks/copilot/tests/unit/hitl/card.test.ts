import { describe, expect, it } from 'vitest';
import { ApprovalCardSchema } from '../../../src/hitl/card';

describe('ApprovalCardSchema', () => {
  it('parses a candidate-list card', () => {
    const card = {
      toolCallId: 'tc_1',
      intent: 'Assign task #142 to Alice',
      riskBadge: 'write' as const,
      summary: '1 task, 1 user',
      details: [
        {
          kind: 'candidateList' as const,
          items: [{ id: 'u1', label: 'Alice', secondary: 'react, ts' }],
        },
      ],
      primary: { label: 'Assign', argsPatch: { assigneeId: 'u1' } },
      alternates: [{ label: 'Assign to Bob', argsPatch: { assigneeId: 'u2' } }],
      decline: { label: 'Leave unassigned' },
      meta: {
        tenantId: 't1',
        userId: 'u1',
        agentPath: ['supervisor', 'work', 'planner'],
        toolId: 'planner_assignTask',
        ts: new Date().toISOString(),
      },
    };
    expect(ApprovalCardSchema.parse(card)).toEqual(card);
  });
  it('rejects unknown detail kinds', () => {
    expect(() =>
      ApprovalCardSchema.parse({
        toolCallId: 'tc_1',
        intent: 'x',
        riskBadge: 'write',
        summary: 's',
        details: [{ kind: 'unknown', items: [] }],
        primary: { label: 'ok' },
        alternates: [],
        decline: { label: 'no' },
        meta: { tenantId: 't', userId: 'u', agentPath: [], toolId: 't', ts: '2026-01-01' },
      }),
    ).toThrow();
  });
});
