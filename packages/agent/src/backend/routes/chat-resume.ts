import { toAISdkStream } from '@mastra/ai-sdk';
import type { ApprovalCard } from '@seta/agent-sdk';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { sql } from 'drizzle-orm';
import type { Hono } from 'hono';
import { agentDb } from '../db/index.ts';
import { type ApprovalDecisionContext, recordApprovalDecision } from '../domain/decide-approval.ts';
import { recordLlmTurn } from '../llm-metrics.ts';
import { resolveModel } from '../model-registry.ts';
import { pumpOrchestrationStream } from '../orchestration-ui-stream.ts';
import {
  type AgentRouteDeps,
  type AgentRouteEnv,
  handleDomainError,
  logError,
  NO_BUFFER_HEADERS,
} from './_shared.ts';
import {
  type ParsedResumeBody,
  parseResumeBodyForWorkflow,
  selectArgsPatch,
} from './resume-body.ts';

/** The status the approval row records. A generic card's 'decline' and a legacy
 *  'reject' are the same decision as far as the row is concerned.
 *
 *  This reads the RAW body, before validation — safe because a `validate` throw
 *  rolls the whole transaction back, so a mis-derived status is never committed. */
function decisionFor(raw: Record<string, unknown>): 'approve' | 'reject' | 'modify' {
  if (raw.chosen !== undefined) return raw.chosen === 'decline' ? 'reject' : 'approve';
  const d = raw.decision;
  return d === 'reject' || d === 'modify' ? d : 'approve';
}

/**
 * Recovery for the decided-but-unexecuted gap: the decision committed but the
 * write that follows it did not (a dropped connection, a process restart
 * mid-resume). Repeating the IDENTICAL decision on a run that is still paused
 * re-enters the suspended run rather than refusing.
 *
 * Safe because the gateway holds the advisory lock on (tenant, idempotencyKey)
 * and returns the committed result with `replayed: true` — the write cannot
 * happen twice. A different decision stays a 409: the user does not get to
 * change their mind after the fact.
 *
 * Deliberately NOT a new `pending → executing → completed` status vocabulary.
 * agent.workflow_approvals is shared with the canvas and evented surfaces, the
 * sweeper and resumeRetry; a fourth state would ripple through all four for a
 * failure mode this covers in one query.
 */
async function replayableDecision(args: {
  approvalId: string;
  tenantId: string;
  requested: 'approve' | 'reject' | 'modify';
}): Promise<ApprovalDecisionContext | null> {
  const status =
    args.requested === 'reject'
      ? 'rejected'
      : args.requested === 'modify'
        ? 'modified'
        : 'approved';
  const res = await agentDb().execute(sql`
    SELECT a.run_id, a.step_id, a.proposed_payload,
           a.mastra_run_id, a.tool_call_id, a.surface_chat_thread_id,
           r.workflow_id
      FROM agent.workflow_approvals a
      JOIN agent.workflow_runs r ON r.run_id = a.run_id
     WHERE a.approval_id = ${args.approvalId}
       AND r.tenant_id   = ${args.tenantId}
       AND a.status      = ${status}
       AND a.decision_payload->>'decision' = ${args.requested}
       AND a.mastra_run_id IS NOT NULL
       AND r.status = 'paused'
  `);
  const rows = (res as unknown as { rows: Record<string, unknown>[] }).rows ?? [];
  const row = rows[0];
  if (!row) return null;
  return {
    runId: row.run_id as string,
    workflowId: row.workflow_id as string,
    stepId: row.step_id as string,
    proposedPayload: row.proposed_payload,
    mastraRunId: row.mastra_run_id as string,
    toolCallId: (row.tool_call_id as string | null) ?? null,
    surfaceChatThreadId: (row.surface_chat_thread_id as string | null) ?? null,
  };
}

/** Only the legacy assignment body carries an assignee override. */
function legacyOverrideUserIds(raw: Record<string, unknown>): string[] | undefined {
  return raw.chosen === undefined && Array.isArray(raw.overrideUserIds)
    ? (raw.overrideUserIds as string[])
    : undefined;
}

export type ResumeDecisionData = {
  decision: 'approve' | 'reject' | 'modify';
  overrideUserIds?: string[];
  alternateIndices?: number[];
  note?: string;
  /** Read off the persisted card, never off the request body — the client must not
   *  be able to choose the key that gates the write. */
  idempotencyKey?: string;
};

/**
 * Maps a decide-approval decision + the persisted ApprovalCard + the request
 * body into the proposeAssignment composite's resume payload. The composite is
 * STATELESS — it reads the assignee set ONLY from `resume.overrideUserIds`, so
 * the endpoint must populate it from the card (approve) or the user's edit
 * (modify). Pure function.
 *
 * Card contract (from staffing buildAssignApprovalCard):
 *   primary.argsPatch     = { action:'assign', assigneeUserIds: string[], taskId }
 *   alternates[i].argsPatch = { action:'assign', assigneeUserIds: string[], taskId }
 *
 * ASSIGNMENT ONLY. FUT-806 deletes this together with the legacy resume body,
 * when assignment moves onto A2 and the gateway. Cards created by FUT-804 use
 * the payload-free path in resume-body.ts instead.
 */
export function mapDecisionToResumeData(
  card: ApprovalCard | null,
  body: ResumeDecisionData,
): ResumeDecisionData {
  const note = body.note;
  const rawKey = (card?.primary?.argsPatch as { idempotencyKey?: unknown } | undefined)
    ?.idempotencyKey;
  const idempotencyKey = typeof rawKey === 'string' ? rawKey : undefined;
  const withNote = (d: ResumeDecisionData): ResumeDecisionData => ({
    ...d,
    ...(note !== undefined ? { note } : {}),
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  });

  if (body.decision === 'reject') {
    return withNote({ decision: 'reject' });
  }

  if (body.decision === 'modify') {
    return withNote({ decision: 'modify', overrideUserIds: body.overrideUserIds ?? [] });
  }

  // approve: take the assignee set from the chosen alternate (if any) else primary.
  const idx = body.alternateIndices?.[0];
  if (idx !== undefined && card?.alternates?.[idx]) {
    const alt = card.alternates[idx]?.argsPatch as { assigneeUserIds?: unknown };
    const overrideUserIds = Array.isArray(alt.assigneeUserIds)
      ? (alt.assigneeUserIds as string[])
      : [];
    return withNote({
      decision: 'approve',
      overrideUserIds,
      alternateIndices: body.alternateIndices,
    });
  }

  const primary = (card?.primary?.argsPatch ?? {}) as { assigneeUserIds?: unknown };
  const overrideUserIds = Array.isArray(primary.assigneeUserIds)
    ? (primary.assigneeUserIds as string[])
    : [];
  return withNote({ decision: 'approve', overrideUserIds });
}

/**
 * POST /api/agent/v1/chat/resume — resume a suspended native-suspend agentic
 * HITL run. Records the decision (shared decide core) then re-enters the
 * suspended proposeAssignment composite via the injected resumeOrchestration,
 * streaming its narration back as SSE.
 */
export function mountChatResumeRoute(app: Hono<AgentRouteEnv>, deps: AgentRouteDeps): void {
  app.post('/api/agent/v1/chat/resume', async (c) => {
    const session = c.get('session') as import('../types.ts').SessionLike | undefined;
    if (!session) {
      return c.json({ error: 'unauthorized', message: 'session required' }, 401);
    }
    if (!session.effective_permissions.has('agent.workflow.approve')) {
      return c.json({ error: 'forbidden', message: 'agent.workflow.approve required' }, 403);
    }
    if (!deps.resumeOrchestration) {
      return c.json({ error: 'not_supported', message: 'chat resume runtime not configured' }, 500);
    }

    // approvalId is the ONLY field readable before we know which contract applies.
    const raw = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const approvalId = typeof raw.approvalId === 'string' ? raw.approvalId : '';
    if (!approvalId) {
      return c.json({ error: 'validation_failed', message: 'approvalId required' }, 400);
    }

    // Parsed INSIDE the decision transaction (see validate), so a body that does
    // not match the card never consumes the approval.
    let parsed: ParsedResumeBody | undefined;
    let ctx: ApprovalDecisionContext;
    try {
      ctx = await recordApprovalDecision({
        session,
        approvalId,
        decision: decisionFor(raw),
        overrideUserIds: legacyOverrideUserIds(raw),
        note: typeof raw.note === 'string' ? raw.note : undefined,
        // Reject a misrouted evented/canvas approval INSIDE the transaction
        // (before any write) so a non-resumable row never records a decision.
        requireMastraRun: true,
        validate: (row) => {
          // The ROW's workflow_id picks the schema — never the body's shape.
          parsed = parseResumeBodyForWorkflow(row.workflow_id, raw);
          if (parsed.kind === 'generic') {
            // Throws validation_failed for an out-of-range alternateIndex, or a
            // row with no stored preview — before anything is written.
            selectArgsPatch(row.proposed_payload, parsed.body);
          }
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'already_decided') {
        return handleDomainError(c, err);
      }
      const replay = await replayableDecision({
        approvalId,
        tenantId: session.tenant_id,
        requested: decisionFor(raw),
      });
      if (!replay) return handleDomainError(c, err);
      try {
        parsed = parseResumeBodyForWorkflow(replay.workflowId, raw);
      } catch (parseErr) {
        return handleDomainError(c, parseErr);
      }
      ctx = replay;
    }

    // requireMastraRun guarantees this is set; narrow the type for the resume call.
    if (ctx.mastraRunId == null) {
      return c.json({ error: 'not_resumable', message: 'approval is not resumable' }, 409);
    }
    if (!parsed) {
      // Unreachable: validate always runs before the write. Defensive so a future
      // refactor that drops the hook fails loudly rather than resuming blind.
      return c.json({ error: 'validation_failed', message: 'body was not validated' }, 400);
    }

    const resume: Record<string, unknown> =
      parsed.kind === 'generic'
        ? // Verbatim off the persisted card. `note` is deliberately NOT merged in:
          // it is audit metadata about the decision, already recorded on the row
          // and the outbox event, and never an input to the mutation.
          selectArgsPatch(ctx.proposedPayload, parsed.body)
        : (mapDecisionToResumeData(ctx.proposedPayload as ApprovalCard | null, {
            decision: parsed.body.decision,
            overrideUserIds: parsed.body.overrideUserIds,
            alternateIndices: parsed.body.alternateIndices,
            note: parsed.body.note,
          }) as unknown as Record<string, unknown>);

    const resumeOrchestration = deps.resumeOrchestration;
    const mastraRunId = ctx.mastraRunId;
    const toolCallId = ctx.toolCallId ?? undefined;
    const threadId = ctx.surfaceChatThreadId ?? undefined;

    const uiStream = createUIMessageStream({
      execute: async ({ writer }) => {
        const run = await resumeOrchestration(resume, {
          tenantId: session.tenant_id,
          actorUserId: session.user_id,
          threadId,
          mastraRunId,
          toolCallId,
          workflowId: ctx.workflowId,
        });
        const aiParts = toAISdkStream(run.output, {
          from: 'agent',
          version: 'v6',
          sendReasoning: true,
          sendStart: true,
          sendFinish: true,
          onError: (e: unknown) => {
            logError(
              deps,
              { subsystem: 'agent.chat', event: 'resume.stream.error', threadId, err: e },
              'agent chat resume stream error',
            );
            return e instanceof Error ? e.message : String(e);
          },
        });
        const turnStartAtMs = performance.now();
        const { timing } = await pumpOrchestrationStream(
          writer as unknown as import('../orchestration-ui-stream.ts').UiStreamWriter,
          aiParts as AsyncIterable<{ type: string; delta?: string; data?: unknown }>,
          { finalize: run.finalize, onApproval: async () => {} },
        );
        // Best-effort throughput for the post-approval continuation. The original
        // run's model isn't carried on resume, so attribute to the default key.
        try {
          const usage = await run.output.usage;
          recordLlmTurn({
            tenantId: session.tenant_id,
            model: resolveModel('auto', { tierHint: 'fast' }).entry.key,
            inputTokens: usage?.inputTokens ?? 0,
            outputTokens: usage?.outputTokens ?? 0,
            firstTokenAtMs: timing.firstTokenAtMs,
            lastTokenAtMs: timing.lastTokenAtMs,
            turnStartAtMs,
          });
        } catch {
          // metrics only — never break the resume turn
        }
      },
    });
    return createUIMessageStreamResponse({ stream: uiStream, headers: NO_BUFFER_HEADERS });
  });
}
