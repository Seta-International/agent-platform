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

describe('ApprovalCardSchema — meta mutex fields (FUT-840)', () => {
  function metaOnly(meta: Record<string, unknown>) {
    return {
      toolCallId: 'tc-1',
      intent: 'Update "Deploy API"',
      riskBadge: 'write' as const,
      summary: 'Due will change.',
      details: [],
      primary: { label: 'Apply', argsPatch: {} },
      alternates: [],
      decline: { label: 'Cancel' },
      meta: {
        tenantId: 't1',
        userId: 'u1',
        agentPath: ['action'],
        toolId: 'planner_updateTask',
        ts: '2026-08-13T00:00:00.000Z',
        ...meta,
      },
    };
  }

  it('accepts a plural dedupKeys array — a bulk card needs one key per task', () => {
    const parsed = ApprovalCardSchema.parse(
      metaOnly({ dedupKeys: ['task:a', 'task:b', 'task:c'] }),
    );
    expect(parsed.meta.dedupKeys).toEqual(['task:a', 'task:b', 'task:c']);
  });

  it('accepts supersedes as a uuid — the only channel to the writer (design D10)', () => {
    const id = '7f3a1c2e-1111-4222-8333-444455556666';
    expect(ApprovalCardSchema.parse(metaOnly({ supersedes: id })).meta.supersedes).toBe(id);
  });

  it('rejects a supersedes that is not a uuid, so a model-invented string cannot reach the writer', () => {
    expect(() => ApprovalCardSchema.parse(metaOnly({ supersedes: 'the-open-one' }))).toThrow();
  });

  it('still accepts the legacy singular dedupKey — one release of tolerant reads', () => {
    expect(ApprovalCardSchema.parse(metaOnly({ dedupKey: 'assign:a' })).meta.dedupKey).toBe(
      'assign:a',
    );
  });

  it('accepts a card that declares no mutex at all — create has no task yet', () => {
    const parsed = ApprovalCardSchema.parse(metaOnly({}));
    expect(parsed.meta.dedupKeys).toBeUndefined();
    expect(parsed.meta.dedupKey).toBeUndefined();
  });
});
