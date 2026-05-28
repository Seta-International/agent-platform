import type { Mastra } from '@mastra/core';
import { CHAT_HITL_WORKFLOW_ID_PREFIX, type ChatHitlDecider } from '@seta/agent-sdk';
import { sql } from 'drizzle-orm';
import { agentDb } from '../db/index.ts';
import type { SessionLike } from '../types.ts';

export interface DecideApprovalOpts {
  session: SessionLike;
  approvalId: string;
  decision: 'approve' | 'reject' | 'modify';
  /**
   * For 'modify' decisions: the assignee set the user composed in the UI. The
   * workflow's primary.argsPatch is taken as the template and its
   * `assigneeUserIds` field is replaced with this array. A planner task can
   * have multiple assignees, so this is plural by contract.
   */
  overrideUserIds?: string[];
  /**
   * For 'approve' decisions on alternates: indices into the card's
   * `alternates[]` array. When a single index is set, uses
   * `alternates[N].argsPatch` as resumeData. When multiple indices are set,
   * merges their `existingId` fields into an `existingIds` array with
   * `kind: 'link'`.
   */
  alternateIndex?: number;
  alternateIndices?: number[];
  note?: string;
  mastra: Mastra;
  /**
   * Per-tool-ID handlers for chat-flow HITL decisions.
   *
   * When workflow_id starts with CHAT_HITL_WORKFLOW_ID_PREFIX the approval was
   * created by a chat-flow tool via ChatHitlRecorder. In that case there is no
   * Mastra workflow to resume — instead, the matching decider here executes the
   * domain action directly. Populated by AgentRouteDeps.chatHitlDeciders.
   */
  chatHitlDeciders?: Record<string, ChatHitlDecider>;
  log?: {
    error: (obj: unknown, msg?: string) => void;
  };
}

export interface DecideApprovalResult {
  runId: string;
  resumed: boolean;
}

interface ApprovalDecisionContext {
  runId: string;
  workflowId: string;
  stepId: string;
  proposedPayload: unknown;
}

interface ApprovalCardLike {
  primary?: { argsPatch?: Record<string, unknown> };
  alternates?: ReadonlyArray<{ argsPatch?: Record<string, unknown> }>;
  decline?: { argsPatch?: Record<string, unknown> };
}

/**
 * Translate a generic decide-approval decision (approve/reject/modify) into
 * the workflow's resumeData by reading the ApprovalCard's argsPatch fields.
 *
 * Contract: every workflow that uses HITL via the inbox builds its suspend
 * payload as an ApprovalCard whose primary/alternates/decline argsPatch IS
 * the resumeSchema-shaped payload. The inbox path forwards that through.
 */
function resumeDataFromDecision(
  ctx: ApprovalDecisionContext,
  decision: 'approve' | 'reject' | 'modify',
  overrideUserIds: string[] | undefined,
  alternateIndex: number | undefined,
  alternateIndices: number[] | undefined,
): Record<string, unknown> | undefined {
  const card = (ctx.proposedPayload ?? null) as ApprovalCardLike | null;
  if (!card) return undefined;
  if (decision === 'approve') {
    // Multi-select: merge existingId from each alternate into existingIds array
    const indices = alternateIndices ?? (alternateIndex !== undefined ? [alternateIndex] : []);
    if (indices.length > 0 && card.alternates) {
      const existingIds: string[] = [];
      for (const idx of indices) {
        const alt = card.alternates[idx];
        if (alt?.argsPatch) {
          const id = (alt.argsPatch as { existingId?: string }).existingId;
          if (id) existingIds.push(id);
        }
      }
      if (existingIds.length > 0) {
        return { kind: 'link', existingIds };
      }
    }
    return card.primary?.argsPatch;
  }
  if (decision === 'reject') return card.decline?.argsPatch;
  // modify: substitute the user-composed assignee set into primary.argsPatch.
  if (decision === 'modify' && overrideUserIds && overrideUserIds.length > 0) {
    if (card.primary?.argsPatch) {
      return { ...card.primary.argsPatch, assigneeUserIds: overrideUserIds };
    }
  }
  return undefined;
}

export async function decideApproval(opts: DecideApprovalOpts): Promise<DecideApprovalResult> {
  if (!opts.session.effective_permissions.has('agent.workflow.approve')) {
    throw Object.assign(new Error('forbidden: agent.workflow.approve'), { code: 'forbidden' });
  }

  const ctx = await agentDb().transaction(async (tx): Promise<ApprovalDecisionContext> => {
    interface Row {
      approval_id: string;
      run_id: string;
      step_id: string;
      approver_user_id: string;
      fallback_approver_user_id: string | null;
      surface_canvas: boolean;
      status: string;
      tenant_id: string;
      workflow_id: string;
      proposed_payload: unknown;
    }
    const res = await tx.execute(sql`
      SELECT a.approval_id, a.run_id, a.step_id,
             a.approver_user_id, a.fallback_approver_user_id,
             a.surface_canvas, a.status, a.proposed_payload,
             r.tenant_id, r.workflow_id
        FROM agent.workflow_approvals a
        JOIN agent.workflow_runs r ON r.run_id = a.run_id
       WHERE a.approval_id = ${opts.approvalId}
       FOR UPDATE OF a
    `);
    const rows = (res as unknown as { rows: Row[] }).rows ?? (res as unknown as Row[]);
    const row = rows[0];
    if (!row) throw Object.assign(new Error('not_found'), { code: 'not_found' });
    if (row.status !== 'pending') {
      throw Object.assign(new Error('already_decided'), { code: 'already_decided' });
    }

    if (row.tenant_id !== opts.session.tenant_id) {
      throw Object.assign(new Error('forbidden: cross_tenant'), { code: 'forbidden' });
    }

    const perms = opts.session.effective_permissions;
    const isPrimary = row.approver_user_id === opts.session.user_id;
    const isFallback = row.fallback_approver_user_id === opts.session.user_id;
    const isStepIn = perms.has('agent.workflow.run.read.tenant') && row.surface_canvas;
    if (!isPrimary && !isFallback && !isStepIn) {
      throw Object.assign(new Error('forbidden: not_authorized_for_approval'), {
        code: 'forbidden',
      });
    }

    const decisionStatus =
      opts.decision === 'reject'
        ? 'rejected'
        : opts.decision === 'modify'
          ? 'modified'
          : 'approved';
    const decisionPayload = {
      decision: opts.decision,
      ...(opts.overrideUserIds !== undefined ? { override_user_ids: opts.overrideUserIds } : {}),
      ...(opts.note !== undefined ? { note: opts.note } : {}),
    };
    await tx.execute(sql`
      UPDATE agent.workflow_approvals
         SET status = ${decisionStatus},
             decision_payload = ${JSON.stringify(decisionPayload)}::jsonb,
             decided_by = ${opts.session.user_id},
             decided_at = now()
       WHERE approval_id = ${opts.approvalId}
    `);

    const outboxPayload: Record<string, unknown> = {
      approval_id: row.approval_id,
      decision: opts.decision,
      decided_by: opts.session.user_id,
      decided_at: new Date().toISOString(),
    };
    if (opts.note !== undefined) outboxPayload.note = opts.note;
    await tx.execute(sql`
      INSERT INTO core.events (id, tenant_id, aggregate_type, aggregate_id, event_type, event_version, payload)
      VALUES (gen_random_uuid(), ${row.tenant_id}, 'workflow_run', ${row.run_id},
              'agent.workflow.approval.decided', 1, ${JSON.stringify(outboxPayload)}::jsonb)
    `);

    return {
      runId: row.run_id,
      workflowId: row.workflow_id,
      stepId: row.step_id,
      proposedPayload: row.proposed_payload,
    };
  });

  const mastraTyped = opts.mastra as unknown as {
    getWorkflow: (id: string) =>
      | {
          createRun: (opts: { runId: string }) => Promise<{
            resume: (args: {
              step?: string | string[];
              resumeData: Record<string, unknown>;
            }) => Promise<void>;
          }>;
        }
      | undefined;
  };

  // ── Chat-flow HITL path ──────────────────────────────────────────────────
  // Approvals with workflow_id starting with CHAT_HITL_WORKFLOW_ID_PREFIX were
  // created by a tool calling ChatHitlRecorder (not by the evented-workflow
  // lifecycle hook). There is no Mastra workflow run to resume. Instead, the
  // registered ChatHitlDecider for the tool executes the domain action directly.
  if (ctx.workflowId.startsWith(CHAT_HITL_WORKFLOW_ID_PREFIX)) {
    const toolId = ctx.workflowId.slice(CHAT_HITL_WORKFLOW_ID_PREFIX.length);
    const decider = opts.chatHitlDeciders?.[toolId];
    if (decider) {
      await decider({
        decision: opts.decision,
        proposedPayload: ctx.proposedPayload,
        overrideUserIds: opts.overrideUserIds,
        note: opts.note,
        session: { user_id: opts.session.user_id, tenant_id: opts.session.tenant_id },
      });
    } else if (opts.log) {
      opts.log.error(
        { subsystem: 'agent.decide-approval', toolId, runId: ctx.runId },
        'no ChatHitlDecider registered for tool — decision recorded but action not executed',
      );
    } else {
      console.error(
        '[agent.decide-approval] no ChatHitlDecider for',
        toolId,
        '— decision recorded but action not executed',
      );
    }
    // Mark the synthetic run as completed so it doesn't appear in active-runs views.
    await agentDb().execute(sql`
      UPDATE agent.workflow_runs
         SET status = 'success', finished_at = now()
       WHERE run_id = ${ctx.runId}
    `);
    return { runId: ctx.runId, resumed: false };
  }

  // ── Evented-workflow HITL path ───────────────────────────────────────────
  const workflow = mastraTyped.getWorkflow(ctx.workflowId);
  if (!workflow) return { runId: ctx.runId, resumed: false };
  const run = await workflow.createRun({ runId: ctx.runId });
  if (!run) return { runId: ctx.runId, resumed: false };

  // Translate the generic decision into the workflow's resumeSchema by
  // reading the ApprovalCard's argsPatch fields. Falls back to a passthrough
  // shape so older approvals (or workflows that don't carry argsPatch) at
  // least surface the decision instead of erroring.
  const fromCard = resumeDataFromDecision(
    ctx,
    opts.decision,
    opts.overrideUserIds,
    opts.alternateIndex,
    opts.alternateIndices,
  );
  const resumeData: Record<string, unknown> = fromCard ?? {
    decision: opts.decision,
    ...(opts.overrideUserIds !== undefined ? { override_user_ids: opts.overrideUserIds } : {}),
  };
  if (opts.note !== undefined && resumeData.note === undefined) {
    resumeData.note = opts.note;
  }

  // Only pass `step` when the projection captured a real step id. Older
  // adapter versions stored the 'await-approval' placeholder, and passing a
  // non-existent step makes Mastra's resume throw — let it auto-resolve from
  // the snapshot's suspendedPaths in that case.
  // IMPORTANT: pass step as an array to prevent Mastra from splitting on '.'
  // (step IDs like 'assignBySkill.suggest' would be incorrectly treated as
  // nested workflow paths if passed as a plain string).
  const resumeOpts: { step?: string[]; resumeData: Record<string, unknown> } =
    ctx.stepId && ctx.stepId !== 'await-approval'
      ? { step: [ctx.stepId], resumeData }
      : { resumeData };
  try {
    await run.resume(resumeOpts);
  } catch (err) {
    // run.resume() runs AFTER the DB transaction commits. If it throws here
    // (e.g. legacy approval with no card to translate, or workflow code raised)
    // Mastra never advances the workflow, so workflow_runs.status would stay
    // 'paused' forever even though the user explicitly decided. Mark the run
    // as canceled with the error so the UI clearly reflects "this run is
    // done — start fresh", instead of leaving it hung.
    const message = err instanceof Error ? err.message : String(err);
    try {
      await agentDb().execute(sql`
        UPDATE agent.workflow_runs
           SET status = 'canceled',
               finished_at = now(),
               error_summary = ${`resume_failed: ${message}`}
         WHERE run_id = ${ctx.runId}
           AND status IN ('paused', 'running')
      `);
    } catch (cancelErr) {
      if (opts.log) {
        opts.log.error(
          { subsystem: 'agent.decide-approval', runId: ctx.runId, err: cancelErr },
          'cancel-on-resume-fail update failed',
        );
      } else {
        console.error('[agent.decide-approval.cancel-on-resume-fail]', cancelErr);
      }
    }
    // For Reject the user wanted the run to end, and canceling it does exactly
    // that — return success even though resume failed. For Approve/Modify the
    // user wanted the workflow to take an action; surface the failure so the
    // UI can tell them their decision didn't go through as intended.
    if (opts.decision === 'reject') return { runId: ctx.runId, resumed: false };
    throw err;
  }
  return { runId: ctx.runId, resumed: true };
}
