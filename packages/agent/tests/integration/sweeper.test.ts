import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { describe, expect, it, vi } from 'vitest';
import { recordApprovalDecision } from '../../src/backend/domain/decide-approval.ts';
import { onLifecycleEvent } from '../../src/backend/workflows/_infra/lifecycle-hook.ts';
import { sweepWorkflowApprovals } from '../../src/backend/workflows/_infra/sweeper.ts';
import { buildSession, withAgentTestDb } from '../helpers.ts';

async function seedSuspendedRun(
  pool: import('pg').Pool,
  args: {
    runId: string;
    tenantId: string;
    approverUserId: string;
    expiresAt: Date;
    proposedPayload?: unknown;
  },
): Promise<void> {
  await onLifecycleEvent(pool, {
    kind: 'run-started',
    runId: args.runId,
    eventSeq: 1,
    workflowId: 'agent.x',
    tenantId: args.tenantId,
    startedBy: args.approverUserId,
    startedVia: 'event',
    parentThreadId: null,
    parentRunId: null,
    sourceEventId: null,
    inputSummary: {},
    occurredAt: new Date(),
  });
  await onLifecycleEvent(pool, {
    kind: 'run-suspended',
    runId: args.runId,
    eventSeq: 2,
    workflowId: 'agent.x',
    tenantId: args.tenantId,
    occurredAt: new Date(),
    stepId: 'await-approval',
    suspendReason: 'hitl_pending',
    proposedPayload: args.proposedPayload ?? {},
    approverUserId: args.approverUserId,
    fallbackApproverUserId: null,
    surfaceCanvas: true,
    surfaceChatThreadId: null,
    expiresAt: args.expiresAt,
  });
}

function makeMastra(resume: ReturnType<typeof vi.fn>): Mastra {
  return {
    getWorkflow: () => ({
      createRun: async () => ({ resume }),
    }),
  } as unknown as Mastra;
}

describe('sweepWorkflowApprovals', () => {
  it('marks expired pending approvals as expired and resumes with decision=timeout', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const runId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId,
        approverUserId: randomUUID(),
        expiresAt: new Date(Date.now() - 1000),
      });

      const resume = vi.fn().mockResolvedValue(undefined);
      const result = await sweepWorkflowApprovals({ pool, mastra: makeMastra(resume) });
      expect(result.expired).toBe(1);

      const a = await pool.query<{ status: string }>(
        `SELECT status FROM agent.workflow_approvals WHERE run_id = $1`,
        [runId],
      );
      expect(a.rows[0]!.status).toBe('expired');
      expect(resume).toHaveBeenCalledTimes(1);
      const arg = resume.mock.calls[0]![0] as { step: string; resumeData: { decision: string } };
      expect(arg.step).toBe('await-approval');
      expect(arg.resumeData.decision).toBe('timeout');

      const evt = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
        `SELECT event_type, payload FROM core.events
          WHERE aggregate_id = $1 AND event_type = 'agent.workflow.approval.decided'`,
        [runId],
      );
      expect(evt.rowCount).toBe(1);
      expect(evt.rows[0]!.payload.decision).toBe('timeout');
    });
  });

  it('is idempotent — second run is a no-op', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const runId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId,
        approverUserId: randomUUID(),
        expiresAt: new Date(Date.now() - 1000),
      });
      const resume = vi.fn().mockResolvedValue(undefined);
      const mastra = makeMastra(resume);
      await sweepWorkflowApprovals({ pool, mastra });
      await sweepWorkflowApprovals({ pool, mastra });
      expect(resume).toHaveBeenCalledTimes(1);
    });
  });

  it('ignores non-expired pending approvals', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const runId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId,
        approverUserId: randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
      });
      const resume = vi.fn().mockResolvedValue(undefined);
      const result = await sweepWorkflowApprovals({ pool, mastra: makeMastra(resume) });
      expect(result.expired).toBe(0);
      expect(resume).not.toHaveBeenCalled();
    });
  });

  it('continues across multiple expired rows within one sweep', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const expired1 = randomUUID();
      const expired2 = randomUUID();
      await seedSuspendedRun(pool, {
        runId: expired1,
        tenantId,
        approverUserId: randomUUID(),
        expiresAt: new Date(Date.now() - 1000),
      });
      await seedSuspendedRun(pool, {
        runId: expired2,
        tenantId,
        approverUserId: randomUUID(),
        expiresAt: new Date(Date.now() - 2000),
      });

      const resume = vi.fn().mockResolvedValue(undefined);
      const result = await sweepWorkflowApprovals({ pool, mastra: makeMastra(resume) });
      expect(result.expired).toBe(2);
      expect(resume).toHaveBeenCalledTimes(2);
    });
  });
});

/** A card shaped like the one buildAssignApprovalCard produces: every action's
 *  argsPatch carries the gated-write key. */
function cardWithKey(key: string) {
  return {
    primary: {
      label: 'Assign',
      argsPatch: {
        action: 'assign',
        assigneeUserIds: [randomUUID()],
        taskId: randomUUID(),
        idempotencyKey: key,
      },
    },
    decline: { label: 'Leave unassigned', argsPatch: { action: 'decline', idempotencyKey: key } },
  };
}

async function approvalIdFor(pool: import('pg').Pool, runId: string): Promise<string> {
  const r = await pool.query<{ approval_id: string }>(
    'SELECT approval_id FROM agent.workflow_approvals WHERE run_id = $1',
    [runId],
  );
  const id = r.rows[0]?.approval_id;
  if (!id) throw new Error('seeded approval not found');
  return id;
}

async function keyRowCount(pool: import('pg').Pool, key: string): Promise<number> {
  const r = await pool.query(
    'SELECT count(*)::int AS n FROM core.mutation_idempotency WHERE key = $1',
    [key],
  );
  return r.rows[0].n as number;
}

/**
 * Cancel and expiry never reach the mutation gateway, so they must never leave an
 * idempotency key behind — a stray key would silently swallow a LATER, legitimate
 * write that happened to reuse it. Both branches are already correct; these lock
 * that in.
 */
describe('cancel and expiry leave no idempotency key (FUT-803)', () => {
  it('rejecting an approval records the decision and writes no key row', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const runId = randomUUID();
      const approverUserId = randomUUID();
      const key = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId,
        approverUserId,
        expiresAt: new Date(Date.now() + 3_600_000),
        proposedPayload: cardWithKey(key),
      });
      const approvalId = await approvalIdFor(pool, runId);

      await recordApprovalDecision({
        session: buildSession({ tenantId, userId: approverUserId }),
        approvalId,
        decision: 'reject',
      });

      const a = await pool.query<{ status: string }>(
        'SELECT status FROM agent.workflow_approvals WHERE approval_id = $1',
        [approvalId],
      );
      expect(a.rows[0]!.status).toBe('rejected');
      // The decline argsPatch never reaches the gateway: no write, no key.
      expect(await keyRowCount(pool, key)).toBe(0);
    });
  });

  it('approving lifts the card key into decision_payload, so resumeRetry replays gated', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const runId = randomUUID();
      const approverUserId = randomUUID();
      const key = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId,
        approverUserId,
        expiresAt: new Date(Date.now() + 3_600_000),
        proposedPayload: cardWithKey(key),
      });
      const approvalId = await approvalIdFor(pool, runId);

      await recordApprovalDecision({
        session: buildSession({ tenantId, userId: approverUserId }),
        approvalId,
        decision: 'approve',
      });

      // resumeRetry resumes with decision_payload VERBATIM, so the key has to live
      // here — not only in the /chat/resume mapper — for the retry path to be gated.
      const a = await pool.query<{ decision_payload: Record<string, unknown> }>(
        'SELECT decision_payload FROM agent.workflow_approvals WHERE approval_id = $1',
        [approvalId],
      );
      expect(a.rows[0]!.decision_payload).toMatchObject({
        decision: 'approve',
        idempotencyKey: key,
      });
    });
  });

  it('an approval whose card predates FUT-803 records a decision with no key at all', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const runId = randomUUID();
      const approverUserId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId,
        approverUserId,
        expiresAt: new Date(Date.now() + 3_600_000),
        proposedPayload: { primary: { argsPatch: { action: 'assign' } } },
      });
      const approvalId = await approvalIdFor(pool, runId);

      await recordApprovalDecision({
        session: buildSession({ tenantId, userId: approverUserId }),
        approvalId,
        decision: 'approve',
      });

      const a = await pool.query<{ decision_payload: Record<string, unknown> }>(
        'SELECT decision_payload FROM agent.workflow_approvals WHERE approval_id = $1',
        [approvalId],
      );
      expect(a.rows[0]!.decision_payload).toEqual({ decision: 'approve' });
    });
  });

  it('an expired approval cannot then be decided, and still leaves no key row', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const runId = randomUUID();
      const approverUserId = randomUUID();
      const key = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId,
        approverUserId,
        expiresAt: new Date(Date.now() - 3_600_000),
        proposedPayload: cardWithKey(key),
      });
      const approvalId = await approvalIdFor(pool, runId);

      const resume = vi.fn().mockResolvedValue(undefined);
      await sweepWorkflowApprovals({ pool, mastra: makeMastra(resume) });

      const a = await pool.query<{ status: string }>(
        'SELECT status FROM agent.workflow_approvals WHERE approval_id = $1',
        [approvalId],
      );
      expect(a.rows[0]!.status).toBe('expired');

      await expect(
        recordApprovalDecision({
          session: buildSession({ tenantId, userId: approverUserId }),
          approvalId,
          decision: 'approve',
        }),
      ).rejects.toMatchObject({ code: 'already_decided' });

      expect(await keyRowCount(pool, key)).toBe(0);
    });
  });
});
