import { randomUUID } from 'node:crypto';
import type { ApprovalCard } from '@seta/agent-sdk';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { listThreadApprovals } from '../../src/backend/domain/list-thread-approvals.ts';
import { writeChatApprovalRow } from '../../src/backend/domain/write-chat-approval-row.ts';
import type { SessionLike } from '../../src/backend/types.ts';
import { withAgentTestDb } from '../helpers.ts';

function sessionFor(userId: string, tenantId = randomUUID()): SessionLike {
  return {
    tenant_id: tenantId,
    user_id: userId,
    effective_permissions: new Set<string>(),
    role_summary: { roles: [], cross_tenant_read: false },
  };
}

function card(taskId: string, tenantId: string, userId: string): ApprovalCard {
  return {
    toolCallId: `staffing-orchestrator:${taskId}`,
    intent: 'Assign "AWS migration"',
    riskBadge: 'write',
    summary: 'Top match: Alice (1 skill(s) matched, available).',
    details: [
      {
        kind: 'candidateList',
        items: [{ id: 'u1', label: 'Alice', secondary: 'skills: aws · available', score: 0.9 }],
      },
    ],
    primary: {
      label: 'Assign to Alice',
      argsPatch: { action: 'assign', assigneeUserIds: ['u1'], taskId },
    },
    alternates: [],
    decline: { label: 'Leave unassigned' },
    meta: {
      tenantId,
      userId,
      agentPath: ['staffing', 'orchestrator'],
      toolId: 'planner_proposeAssignment',
      ts: new Date().toISOString(),
    },
  };
}

async function seedApproval(
  pool: Pool,
  args: { tenantId: string; userId: string; threadId: string | null },
): Promise<{ approvalId: string }> {
  const ids = await writeChatApprovalRow({
    card: card(randomUUID(), args.tenantId, args.userId),
    mastraRunId: randomUUID(),
    toolCallId: randomUUID(),
    tenantId: args.tenantId,
    userId: args.userId,
    threadId: args.threadId,
    pool,
  });
  return { approvalId: ids.approvalId };
}

// Flip a seeded approval to a decided status the way decide-approval.ts does
// (status + decision_payload + decided_by + decided_at in one UPDATE).
async function decideDirectly(pool: Pool, approvalId: string, status: string): Promise<void> {
  await pool.query(
    `UPDATE agent.workflow_approvals
        SET status = $2,
            decision_payload = '{"decision":"approve"}'::jsonb,
            decided_by = approver_user_id,
            decided_at = now()
      WHERE approval_id = $1`,
    [approvalId, status],
  );
}

describe('listThreadApprovals', () => {
  it('returns pending and decided rows for the thread, oldest first', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const me = sessionFor(userId, tenantId);

      const first = await seedApproval(pool, { tenantId, userId, threadId: 'thread-1' });
      const second = await seedApproval(pool, { tenantId, userId, threadId: 'thread-1' });
      await decideDirectly(pool, first.approvalId, 'approved');

      const rows = await listThreadApprovals({ session: me, threadId: 'thread-1' });

      expect(rows.map((r) => r.approvalId)).toEqual([first.approvalId, second.approvalId]);
      expect(rows[0]).toMatchObject({
        status: 'approved',
        decisionPayload: { decision: 'approve' },
      });
      expect(rows[0]!.decidedAt).toBeInstanceOf(Date);
      expect(rows[1]).toMatchObject({ status: 'pending', decisionPayload: null });
      expect(rows[1]!.decidedAt).toBeNull();
    });
  });

  it('serializes agentic=true for native-suspend rows and false when mastra_run_id is null', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const me = sessionFor(userId, tenantId);

      const agentic = await seedApproval(pool, { tenantId, userId, threadId: 'thread-1' });
      const evented = await seedApproval(pool, { tenantId, userId, threadId: 'thread-1' });
      await pool.query(
        `UPDATE agent.workflow_approvals SET mastra_run_id = NULL WHERE approval_id = $1`,
        [evented.approvalId],
      );

      const rows = await listThreadApprovals({ session: me, threadId: 'thread-1' });
      const byId = new Map(rows.map((r) => [r.approvalId, r] as const));

      expect(byId.get(agentic.approvalId)!.agentic).toBe(true);
      expect(byId.get(evented.approvalId)!.agentic).toBe(false);
    });
  });

  it('excludes other threads and approvals addressed to other users', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const me = sessionFor(userId, tenantId);

      const mine = await seedApproval(pool, { tenantId, userId, threadId: 'thread-1' });
      await seedApproval(pool, { tenantId, userId, threadId: 'thread-2' });
      await seedApproval(pool, { tenantId, userId: randomUUID(), threadId: 'thread-1' });

      const rows = await listThreadApprovals({ session: me, threadId: 'thread-1' });
      expect(rows.map((r) => r.approvalId)).toEqual([mine.approvalId]);
    });
  });

  it('returns an empty array for a thread with no approvals', async () => {
    await withAgentTestDb(async () => {
      const me = sessionFor(randomUUID());
      expect(await listThreadApprovals({ session: me, threadId: 'nope' })).toEqual([]);
    });
  });
});
