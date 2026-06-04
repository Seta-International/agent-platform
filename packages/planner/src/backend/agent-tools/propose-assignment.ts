import {
  type ApprovalCard,
  actorFromContext,
  type ChatHitlRecorder,
  defineAgentTool,
  getPendingAssignRunIdForTask,
  RC_CHAT_HITL_RECORDER,
  recordEntityExposure,
  resolveTaskRef,
} from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { AssignBySkillOutputSchema } from '../workflows/assign-by-skill/schemas.ts';

// ─────────────────────────────────────────────────────────────────────────────
// planner_proposeAssignment — CHAT-FLOW ONLY HITL tool
//
// This tool is called exclusively from the agentic chat path (ctx.agent is
// always set). The assignBySkill evented workflow has its own suspend in
// packages/planner/src/backend/workflows/assign-by-skill/spec.ts and does NOT
// use this tool.
//
// WHY NO ctx.agent.suspend()
// ──────────────────────────
// ctx.agent.suspend() in Mastra's agentic execution emits a `tool-call-suspended`
// SSE chunk locally but NEVER publishes to the `'workflows'` global pubsub
// channel. Therefore the lifecycle hook (packages/agent/…/lifecycle-hook.ts)
// never fires, no agent.workflow_approvals row is created, and the frontend's
// useThreadPendingApprovals poll sees nothing — the card never appears.
//
// CORRECT APPROACH
// ────────────────
// 1. Build the ApprovalCard.
// 2. Call the ChatHitlRecorder injected into requestContext by routes.ts.
//    It atomically writes workflow_runs + workflow_approvals in one transaction.
// 3. Return { kind: 'pending-approval' } — the agent completes its turn and
//    tells the user to review the card shown above.
// 4. When the user decides, the decide-approval endpoint calls the registered
//    ChatHitlDecider (plannerProposeAssignmentChatHitlDecider) to execute
//    the assignment directly — no Mastra workflow resume needed.
// ─────────────────────────────────────────────────────────────────────────────

const ProposeAssignmentInputSchema = z.object({
  taskRef: z
    .string()
    .trim()
    .min(1)
    .describe(
      'Task UUID, or an ordinal reference into your working memory `recentTasks` list: ' +
        '"#1" / "1" / "first" → most recent, "#2" / "second" → next, "last" → most recent. ' +
        'Prefer ordinals when the user is referring to something you just discussed.',
    ),
  candidates: z
    .array(
      z.object({
        userId: z.string().uuid(),
        displayName: z.string().min(1).describe('Human-readable name shown in the approval card'),
        rationale: z.string().min(1).max(300),
        confidence: z.enum(['low', 'medium', 'high']),
        signals: z
          .array(
            z.enum([
              'skill-match',
              'past-similar-work',
              'load-headroom',
              'timezone-overlap',
              'availability',
              'team-fit',
            ]),
          )
          .optional(),
      }),
    )
    .min(1)
    .max(5),
  summary: z.string().max(500),
});

type ProposeAssignmentInput = z.infer<typeof ProposeAssignmentInputSchema>;

function buildCard(
  input: ProposeAssignmentInput,
  taskId: string,
  toolCallId: string,
  session: { tenantId: string; userId: string },
): ApprovalCard {
  const [top, ...rest] = input.candidates;
  return {
    toolCallId,
    intent: `Assign task ${taskId} based on agent reasoning`,
    riskBadge: 'write',
    summary: input.summary,
    details: [
      {
        kind: 'candidateList',
        items: input.candidates.map((c) => ({
          id: c.userId,
          label: c.displayName,
          secondary: c.rationale,
          meta: { confidence: c.confidence, signals: c.signals ?? [] },
        })),
      },
    ],
    primary: top
      ? {
          label: `Assign to ${top.displayName}`,
          // taskId is embedded so ChatHitlDecider can retrieve the target task
          // without storing a separate column (it's read from proposed_payload).
          argsPatch: { action: 'assign', assigneeUserIds: [top.userId], taskId },
        }
      : { label: 'No candidates' },
    alternates: rest.map((c) => ({
      label: `Assign to ${c.displayName}`,
      argsPatch: { action: 'assign', assigneeUserIds: [c.userId], taskId },
    })),
    decline: { label: 'Leave unassigned' },
    meta: {
      tenantId: session.tenantId,
      userId: session.userId,
      agentPath: ['supervisor', 'work', 'planner'],
      toolId: 'planner_proposeAssignment',
      ts: new Date().toISOString(),
    },
  };
}

export const plannerProposeAssignmentTool = defineAgentTool({
  id: 'planner_proposeAssignment',
  name: 'Propose Assignment',
  description:
    'Surface 1-5 candidate assignees with per-candidate rationale and confidence. ' +
    'After gathering enough signal, call this tool to show the user an interactive ' +
    'approval card. It records the suggestion and returns immediately — the agent ' +
    'turn completes and the user picks an assignee from the card above.',
  input: ProposeAssignmentInputSchema,
  output: AssignBySkillOutputSchema,
  rbac: 'planner.task.assign',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);

    const { taskId } = await resolveTaskRef(ctx as never, input.taskRef);

    // Mutex: check if there's already a pending proposal for this task
    // (from another thread or the assignBySkill workflow). Prevents competing
    // proposals that could lead to race conditions on approval.
    const existingRunId = await getPendingAssignRunIdForTask({
      taskId,
      tenantId: session.tenant_id,
    });
    if (existingRunId) {
      return {
        kind: 'already-pending' as const,
        taskId,
        message:
          'Another assignment proposal is already pending for this task. ' +
          'Please wait for that to be resolved or cancel it first.',
      } as never;
    }

    const card = buildCard(input, taskId, ctx.agent?.toolCallId ?? 'unknown', {
      tenantId: session.tenant_id,
      userId: actor.user_id,
    });

    // Read the recorder injected by the chat route. Fail loudly if absent —
    // it means this tool was called outside a properly set-up chat context.
    const recorder = ctx.requestContext?.get(RC_CHAT_HITL_RECORDER) as ChatHitlRecorder | undefined;
    if (!recorder) {
      throw new Error(
        'planner_proposeAssignment: ChatHitlRecorder not found in requestContext. ' +
          'The chat route must set RC_CHAT_HITL_RECORDER before calling agent.stream().',
      );
    }

    const { approvalId } = await recorder(card);

    await recordEntityExposure(ctx as never, {
      lastDiscussedTaskId: taskId,
      lastProposedCandidateUserId: input.candidates[0]?.userId ?? null,
    });

    return { kind: 'pending-approval' as const, taskId, approvalId };
  },
});
