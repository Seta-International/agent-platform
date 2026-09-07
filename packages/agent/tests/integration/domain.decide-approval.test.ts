import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { describe, expect, it, vi } from 'vitest';
import {
  decideApproval,
  recordApprovalDecision,
} from '../../src/backend/domain/decide-approval.ts';
import { listMyPendingApprovals } from '../../src/backend/domain/list-my-pending-approvals.ts';
import { onLifecycleEvent } from '../../src/backend/workflows/_infra/lifecycle-hook.ts';
import { buildSession, withAgentTestDb } from '../helpers.ts';

async function seedSuspendedRun(
  pool: import('pg').Pool,
  args: {
    runId: string;
    tenantId: string;
    approverUserId: string;
    surfaceCanvas?: boolean;
    stepId?: string;
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
    stepId: args.stepId ?? 'agent.x.suggest',
    suspendReason: 'hitl_pending',
    proposedPayload: { userId: '77777777-7777-7777-7777-777777777777' },
    approverUserId: args.approverUserId,
    fallbackApproverUserId: null,
    surfaceCanvas: args.surfaceCanvas ?? true,
    surfaceChatThreadId: null,
    expiresAt: new Date(Date.now() + 86400000),
  });
}

function makeMastra(resume: ReturnType<typeof vi.fn>): Mastra {
  return {
    getWorkflow: () => ({
      createRun: async () => ({ resume }),
    }),
  } as unknown as Mastra;
}

describe('listMyPendingApprovals', () => {
  it('returns only the calling user pending approvals', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const other = randomUUID();
      await seedSuspendedRun(pool, {
        runId: randomUUID(),
        tenantId: me.tenant_id,
        approverUserId: me.user_id,
      });
      await seedSuspendedRun(pool, {
        runId: randomUUID(),
        tenantId: me.tenant_id,
        approverUserId: other,
      });
      const result = await listMyPendingApprovals({ session: me });
      expect(result).toHaveLength(1);
      expect(result[0]!.approverUserId).toBe(me.user_id);
    });
  });
});

describe('decideApproval', () => {
  it('marks approved, writes outbox, calls run.resume(step, resumeData) outside the tx', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const runId = randomUUID();
      await seedSuspendedRun(pool, { runId, tenantId: me.tenant_id, approverUserId: me.user_id });
      const [pending] = await listMyPendingApprovals({ session: me });
      expect(pending).toBeDefined();

      const resume = vi.fn().mockResolvedValue(undefined);
      const r = await decideApproval({
        session: me,
        approvalId: pending!.approvalId,
        decision: 'approve',
        mastra: makeMastra(resume),
      });
      expect(r).toEqual({ runId, resumed: true });
      expect(resume).toHaveBeenCalledTimes(1);
      const resumeArg = resume.mock.calls[0]![0] as {
        step: string[];
        resumeData: { decision: string };
      };
      expect(resumeArg.step).toEqual(['agent.x.suggest']);
      expect(resumeArg.resumeData.decision).toBe('approve');

      const row = await pool.query<{ status: string; decided_by: string }>(
        `SELECT status, decided_by FROM agent.workflow_approvals WHERE approval_id = $1`,
        [pending!.approvalId],
      );
      expect(row.rows[0]!.status).toBe('approved');
      expect(row.rows[0]!.decided_by).toBe(me.user_id);

      const outbox = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
        `SELECT event_type, payload FROM core.events
          WHERE aggregate_id = $1 AND event_type = 'agent.workflow.approval.decided'`,
        [runId],
      );
      expect(outbox.rowCount).toBe(1);
      expect(outbox.rows[0]!.payload.decision).toBe('approve');
      expect(outbox.rows[0]!.payload.decided_by).toBe(me.user_id);
    });
  });

  it('translates approve/reject into workflow resumeData via the card argsPatch', async () => {
    // The inbox decide path must forward an ApprovalCard's argsPatch as the
    // workflow resumeData; otherwise Mastra's resumeSchema rejects and Approve
    // 500s. Verifies primary.argsPatch (approve), decline.argsPatch (reject),
    // and the modify path substituting overrideUserIds into primary.argsPatch.
    const cardPayload = {
      intent: 'Assign task',
      summary: 'top: Alice',
      primary: {
        label: 'Assign to Alice',
        argsPatch: { action: 'assign', assigneeUserIds: ['u-1'] },
      },
      alternates: [
        {
          label: 'Assign to Bob',
          argsPatch: { action: 'assign', assigneeUserIds: ['u-2'] },
        },
      ],
      decline: { label: 'Leave unassigned', argsPatch: { action: 'leave-unassigned' } },
    };
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();

      // approve → primary.argsPatch
      const runApprove = randomUUID();
      await pool.query(
        `INSERT INTO agent.workflow_runs (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status, started_at)
         VALUES ($1, 'planner.assignBySkill', $2, $3, 'event', '{}'::jsonb, 'paused', now())`,
        [runApprove, me.tenant_id, me.user_id],
      );
      const approvalIdApprove = randomUUID();
      await pool.query(
        `INSERT INTO agent.workflow_approvals
           (approval_id, run_id, tenant_id, step_id, proposed_payload, approver_user_id,
            fallback_approver_user_id, surface_canvas, surface_chat_thread_id,
            status, expires_at, created_at)
         VALUES ($1, $2, (SELECT tenant_id FROM agent.workflow_runs WHERE run_id = $2),
                 'assignBySkill.suggest', $3::jsonb, $4, NULL, true, NULL,
                 'pending', now() + interval '1 day', now())`,
        [approvalIdApprove, runApprove, JSON.stringify(cardPayload), me.user_id],
      );

      const resumeApprove = vi.fn().mockResolvedValue(undefined);
      await decideApproval({
        session: me,
        approvalId: approvalIdApprove,
        decision: 'approve',
        mastra: makeMastra(resumeApprove),
      });
      expect(resumeApprove.mock.calls[0]![0].resumeData).toEqual({
        action: 'assign',
        assigneeUserIds: ['u-1'],
      });

      // modify(overrideUserIds) → primary.argsPatch with assigneeUserIds replaced
      const runModify = randomUUID();
      await pool.query(
        `INSERT INTO agent.workflow_runs (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status, started_at)
         VALUES ($1, 'planner.assignBySkill', $2, $3, 'event', '{}'::jsonb, 'paused', now())`,
        [runModify, me.tenant_id, me.user_id],
      );
      const approvalIdModify = randomUUID();
      await pool.query(
        `INSERT INTO agent.workflow_approvals
           (approval_id, run_id, tenant_id, step_id, proposed_payload, approver_user_id,
            fallback_approver_user_id, surface_canvas, surface_chat_thread_id,
            status, expires_at, created_at)
         VALUES ($1, $2, (SELECT tenant_id FROM agent.workflow_runs WHERE run_id = $2),
                 'assignBySkill.suggest', $3::jsonb, $4, NULL, true, NULL,
                 'pending', now() + interval '1 day', now())`,
        [approvalIdModify, runModify, JSON.stringify(cardPayload), me.user_id],
      );
      const resumeModify = vi.fn().mockResolvedValue(undefined);
      await decideApproval({
        session: me,
        approvalId: approvalIdModify,
        decision: 'modify',
        overrideUserIds: ['u-1', 'u-2'],
        mastra: makeMastra(resumeModify),
      });
      // modify substitutes the user-composed assignee set into primary.argsPatch,
      // preserving the action discriminator from primary.
      expect(resumeModify.mock.calls[0]![0].resumeData).toEqual({
        action: 'assign',
        assigneeUserIds: ['u-1', 'u-2'],
      });

      // reject → decline.argsPatch
      const runReject = randomUUID();
      await pool.query(
        `INSERT INTO agent.workflow_runs (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status, started_at)
         VALUES ($1, 'planner.assignBySkill', $2, $3, 'event', '{}'::jsonb, 'paused', now())`,
        [runReject, me.tenant_id, me.user_id],
      );
      const approvalIdReject = randomUUID();
      await pool.query(
        `INSERT INTO agent.workflow_approvals
           (approval_id, run_id, tenant_id, step_id, proposed_payload, approver_user_id,
            fallback_approver_user_id, surface_canvas, surface_chat_thread_id,
            status, expires_at, created_at)
         VALUES ($1, $2, (SELECT tenant_id FROM agent.workflow_runs WHERE run_id = $2),
                 'assignBySkill.suggest', $3::jsonb, $4, NULL, true, NULL,
                 'pending', now() + interval '1 day', now())`,
        [approvalIdReject, runReject, JSON.stringify(cardPayload), me.user_id],
      );
      const resumeReject = vi.fn().mockResolvedValue(undefined);
      await decideApproval({
        session: me,
        approvalId: approvalIdReject,
        decision: 'reject',
        mastra: makeMastra(resumeReject),
      });
      expect(resumeReject.mock.calls[0]![0].resumeData).toEqual({
        action: 'leave-unassigned',
      });
    });
  });

  it("omits step when the projected stepId is the legacy 'await-approval' placeholder", async () => {
    // Older adapter versions stored a placeholder when Mastra's suspend event
    // didn't echo a stepId. Passing that placeholder to run.resume() throws
    // because no such step exists in the workflow. Let Mastra auto-resolve the
    // suspended step from the snapshot in that case.
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const runId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId: me.tenant_id,
        approverUserId: me.user_id,
        stepId: 'await-approval',
      });
      const [pending] = await listMyPendingApprovals({ session: me });
      const resume = vi.fn().mockResolvedValue(undefined);
      await decideApproval({
        session: me,
        approvalId: pending!.approvalId,
        decision: 'approve',
        mastra: makeMastra(resume),
      });
      expect(resume).toHaveBeenCalledTimes(1);
      const arg = resume.mock.calls[0]![0] as {
        step?: string;
        resumeData: { decision: string };
      };
      expect(arg.step).toBeUndefined();
      expect(arg.resumeData.decision).toBe('approve');
    });
  });

  it('rejects when caller is neither approver nor step-in eligible', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const stranger = buildSession();
      const other = randomUUID();
      const runId = randomUUID();
      await seedSuspendedRun(pool, { runId, tenantId: stranger.tenant_id, approverUserId: other });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM agent.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;

      await expect(
        decideApproval({
          session: stranger,
          approvalId,
          decision: 'approve',
          mastra: makeMastra(vi.fn()),
        }),
      ).rejects.toThrow(/forbidden/i);
    });
  });

  it('allows step-in when caller has agent.viewer @ tenant AND surface_canvas=true AND same tenant', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const admin = buildSession({
        assignments: [{ role_slug: 'agent.viewer', scope_kind: 'tenant' }],
      });
      const other = randomUUID();
      const runId = await (async () => {
        const id = randomUUID();
        await seedSuspendedRun(pool, {
          runId: id,
          tenantId: admin.tenant_id,
          approverUserId: other,
          surfaceCanvas: true,
        });
        return id;
      })();
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM agent.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;

      const resume = vi.fn().mockResolvedValue(undefined);
      const r = await decideApproval({
        session: admin,
        approvalId,
        decision: 'approve',
        mastra: makeMastra(resume),
      });
      expect(r.resumed).toBe(true);
    });
  });

  it('denies step-in when surface_canvas=false', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const admin = buildSession({
        assignments: [{ role_slug: 'agent.viewer', scope_kind: 'tenant' }],
      });
      const other = randomUUID();
      const runId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId: admin.tenant_id,
        approverUserId: other,
        surfaceCanvas: false,
      });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM agent.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;

      await expect(
        decideApproval({
          session: admin,
          approvalId,
          decision: 'approve',
          mastra: makeMastra(vi.fn()),
        }),
      ).rejects.toThrow(/forbidden/i);
    });
  });

  it('refuses on already-decided approval', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const runId = randomUUID();
      await seedSuspendedRun(pool, { runId, tenantId: me.tenant_id, approverUserId: me.user_id });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM agent.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;

      const mastra = makeMastra(vi.fn().mockResolvedValue(undefined));
      await decideApproval({ session: me, approvalId, decision: 'approve', mastra });
      await expect(
        decideApproval({ session: me, approvalId, decision: 'approve', mastra }),
      ).rejects.toThrow(/already_decided|not_pending|already/i);
    });
  });

  it('rejects cross-tenant decisions even when caller has agent.viewer @ tenant', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const admin = buildSession({
        assignments: [{ role_slug: 'agent.viewer', scope_kind: 'tenant' }],
      });
      const runId = randomUUID();
      await seedSuspendedRun(pool, {
        runId,
        tenantId: randomUUID(),
        approverUserId: randomUUID(),
        surfaceCanvas: true,
      });
      const approvalId = (
        await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM agent.workflow_approvals WHERE run_id = $1`,
          [runId],
        )
      ).rows[0]!.approval_id;

      await expect(
        decideApproval({
          session: admin,
          approvalId,
          decision: 'approve',
          mastra: makeMastra(vi.fn()),
        }),
      ).rejects.toThrow(/forbidden/i);
    });
  });
});

/** An agentic native-suspend chat approval: carries mastra_run_id, so
 *  requireMastraRun passes and the row's workflow_id is a real orchestrator id.
 *  Mirrors the seeder in routes.chat-resume.test.ts. */
async function seedAgenticApproval(
  pool: import('pg').Pool,
  args: { tenantId: string; approverUserId: string },
): Promise<{ approvalId: string; runId: string }> {
  const runId = randomUUID();
  await pool.query(
    `INSERT INTO agent.workflow_runs
       (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status, started_at)
     VALUES ($1, 'planner.assignment-orchestrator', $2, $3, 'chat', '{}'::jsonb, 'paused', now())`,
    [runId, args.tenantId, args.approverUserId],
  );
  const approvalId = randomUUID();
  await pool.query(
    `INSERT INTO agent.workflow_approvals
       (approval_id, run_id, tenant_id, step_id, proposed_payload, approver_user_id,
        fallback_approver_user_id, surface_canvas, surface_chat_thread_id,
        mastra_run_id, tool_call_id, status, expires_at, created_at)
     VALUES ($1, $2, $3, 'chat-hitl', $4::jsonb, $5, NULL, false, NULL,
             $6, 'tc-1', 'pending', now() + interval '1 day', now())`,
    [
      approvalId,
      runId,
      args.tenantId,
      JSON.stringify({ primary: { argsPatch: { action: 'assign', taskId: randomUUID() } } }),
      args.approverUserId,
      randomUUID(),
    ],
  );
  return { approvalId, runId };
}

describe('recordApprovalDecision — validate hook', () => {
  it('a throwing validate leaves the row pending', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const { approvalId } = await seedAgenticApproval(pool, {
        tenantId: me.tenant_id,
        approverUserId: me.user_id,
      });
      await expect(
        recordApprovalDecision({
          session: me,
          approvalId,
          decision: 'approve',
          requireMastraRun: true,
          validate: () => {
            throw Object.assign(new Error('validation_failed: nope'), {
              code: 'validation_failed',
            });
          },
        }),
      ).rejects.toMatchObject({ code: 'validation_failed' });

      const row = await pool.query<{ status: string }>(
        'SELECT status FROM agent.workflow_approvals WHERE approval_id = $1',
        [approvalId],
      );
      expect(row.rows[0]!.status).toBe('pending');
    });
  });

  it('validate receives the row workflow_id and the stored card', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const { approvalId } = await seedAgenticApproval(pool, {
        tenantId: me.tenant_id,
        approverUserId: me.user_id,
      });
      let seen: { workflow_id: string; proposed_payload: unknown } | undefined;
      await recordApprovalDecision({
        session: me,
        approvalId,
        decision: 'approve',
        requireMastraRun: true,
        validate: (row) => {
          seen = row;
        },
      });
      expect(seen?.workflow_id).toBe('planner.assignment-orchestrator');
      expect(seen?.proposed_payload).toBeTruthy();
    });
  });

  it('an expired approval reports code "expired", not "already_decided"', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const { approvalId } = await seedAgenticApproval(pool, {
        tenantId: me.tenant_id,
        approverUserId: me.user_id,
      });
      await pool.query(
        "UPDATE agent.workflow_approvals SET status = 'expired' WHERE approval_id = $1",
        [approvalId],
      );
      await expect(
        recordApprovalDecision({ session: me, approvalId, decision: 'approve' }),
      ).rejects.toMatchObject({ code: 'expired' });
    });
  });
});

/** An EVENTED approval: no mastra_run_id, so D13's chat-card scoping must skip it. */
async function seedEventedApproval(
  pool: import('pg').Pool,
  args: { tenantId: string; approverUserId: string },
): Promise<{ approvalId: string; runId: string }> {
  const runId = randomUUID();
  await pool.query(
    `INSERT INTO agent.workflow_runs
       (run_id, workflow_id, tenant_id, started_by, started_via, input_summary, status, started_at)
     VALUES ($1, 'planner.assignBySkill', $2, $3, 'event', '{}'::jsonb, 'paused', now())`,
    [runId, args.tenantId, args.approverUserId],
  );
  const approvalId = randomUUID();
  await pool.query(
    `INSERT INTO agent.workflow_approvals
       (approval_id, run_id, tenant_id, step_id, proposed_payload, approver_user_id,
        surface_canvas, status, expires_at, created_at)
     VALUES ($1, $2, $3, 'assignBySkill.suggest', '{}'::jsonb, $4, true, 'pending',
             now() + interval '1 day', now())`,
    [approvalId, runId, args.tenantId, args.approverUserId],
  );
  return { approvalId, runId };
}

describe('recordApprovalDecision — a replaced card (FUT-840 design D13)', () => {
  it('reports a SUPERSEDED row with its own code, not "already decided"', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const { approvalId } = await seedAgenticApproval(pool, {
        tenantId: me.tenant_id,
        approverUserId: me.user_id,
      });
      await pool.query(
        `UPDATE agent.workflow_approvals SET status = 'superseded' WHERE approval_id = $1`,
        [approvalId],
      );
      // "already decided" is a misleading thing to tell a user who never decided
      // this one — the same reasoning the `expired` branch beside it carries.
      await expect(
        recordApprovalDecision({
          session: me,
          approvalId,
          decision: 'approve',
          requireMastraRun: true,
        }),
      ).rejects.toMatchObject({ code: 'superseded' });
    });
  });

  it('closes the synthetic run row when a chat card is REJECTED', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const { approvalId, runId } = await seedAgenticApproval(pool, {
        tenantId: me.tenant_id,
        approverUserId: me.user_id,
      });
      await recordApprovalDecision({
        session: me,
        approvalId,
        decision: 'reject',
        requireMastraRun: true,
      });
      const run = await pool.query(
        `SELECT status, finished_at FROM agent.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(run.rows[0].status).toBe('canceled');
      expect(run.rows[0].finished_at).not.toBeNull();
    });
  });

  it('leaves the run row PAUSED when a chat card is APPROVED — replayableDecision keys on it', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const { approvalId, runId } = await seedAgenticApproval(pool, {
        tenantId: me.tenant_id,
        approverUserId: me.user_id,
      });
      await recordApprovalDecision({
        session: me,
        approvalId,
        decision: 'approve',
        requireMastraRun: true,
      });
      const run = await pool.query(`SELECT status FROM agent.workflow_runs WHERE run_id = $1`, [
        runId,
      ]);
      // Spec §0 finding 7: replayableDecision selects on
      // `a.status='approved' AND r.status='paused' AND a.mastra_run_id IS NOT NULL`,
      // and resumeRetry on `r.status='paused'`. Closing this row on approve would
      // silently kill the decided-but-unexecuted recovery: a user whose Confirm
      // committed but whose write was interrupted would get a permanent 409.
      expect(run.rows[0].status).toBe('paused');
    });
  });

  it('does not touch an EVENTED run row on reject — D13 is scoped to chat cards', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const me = buildSession();
      const { approvalId, runId } = await seedEventedApproval(pool, {
        tenantId: me.tenant_id,
        approverUserId: me.user_id,
      });
      await recordApprovalDecision({ session: me, approvalId, decision: 'reject' });
      const run = await pool.query(`SELECT status FROM agent.workflow_runs WHERE run_id = $1`, [
        runId,
      ]);
      expect(run.rows[0].status).toBe('paused');
    });
  });
});
