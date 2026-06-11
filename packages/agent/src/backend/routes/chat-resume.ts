import { toAISdkStream } from '@mastra/ai-sdk';
import type { ApprovalCard } from '@seta/agent-sdk';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import type { Hono } from 'hono';
import { z } from 'zod';
import { recordApprovalDecision } from '../domain/decide-approval.ts';
import { pumpOrchestrationStream } from '../orchestration-ui-stream.ts';
import {
  type AgentRouteDeps,
  type AgentRouteEnv,
  handleDomainError,
  NO_BUFFER_HEADERS,
} from './_shared.ts';

const ResumeBody = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(['approve', 'reject', 'modify']),
  overrideUserIds: z.array(z.string()).optional(),
  alternateIndices: z.array(z.number().int().min(0)).optional(),
  note: z.string().optional(),
});

export type ResumeDecisionData = {
  decision: 'approve' | 'reject' | 'modify';
  overrideUserIds?: string[];
  alternateIndices?: number[];
  note?: string;
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
 */
export function mapDecisionToResumeData(
  card: ApprovalCard | null,
  body: ResumeDecisionData,
): ResumeDecisionData {
  const note = body.note;
  const withNote = (d: ResumeDecisionData): ResumeDecisionData =>
    note !== undefined ? { ...d, note } : d;

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

    const parsed = ResumeBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(
        { error: 'validation_failed', message: 'bad body', details: parsed.error.format() },
        400,
      );
    }
    const body = parsed.data;

    let ctx: Awaited<ReturnType<typeof recordApprovalDecision>>;
    try {
      ctx = await recordApprovalDecision({
        session,
        approvalId: body.approvalId,
        decision: body.decision,
        overrideUserIds: body.overrideUserIds,
        note: body.note,
        // Reject a misrouted evented/canvas approval INSIDE the transaction
        // (before any write) so a non-resumable row never records a decision.
        requireMastraRun: true,
      });
    } catch (err) {
      return handleDomainError(c, err);
    }

    // requireMastraRun guarantees this is set; narrow the type for the resume call.
    if (ctx.mastraRunId == null) {
      return c.json({ error: 'not_resumable', message: 'approval is not resumable' }, 409);
    }

    const resume = mapDecisionToResumeData(ctx.proposedPayload as ApprovalCard | null, {
      decision: body.decision,
      overrideUserIds: body.overrideUserIds,
      alternateIndices: body.alternateIndices,
      note: body.note,
    });

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
        });
        const aiParts = toAISdkStream(run.output, {
          from: 'agent',
          version: 'v6',
          sendReasoning: true,
          sendStart: true,
          sendFinish: true,
          onError: (e: unknown) => String(e),
        });
        await pumpOrchestrationStream(
          writer as unknown as import('../orchestration-ui-stream.ts').UiStreamWriter,
          aiParts as AsyncIterable<{ type: string; delta?: string; data?: unknown }>,
          { finalize: run.finalize, onApproval: async () => {} },
        );
      },
    });
    return createUIMessageStreamResponse({ stream: uiStream, headers: NO_BUFFER_HEADERS });
  });
}
