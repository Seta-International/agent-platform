import {
  type ApprovalCard,
  ApprovalCardSchema,
  actorFromContext,
  defineAgentTool,
} from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { assignTask } from '../domain/assign-task.ts';
import { getTask } from '../domain/get-task.ts';
import {
  AssignBySkillOutputSchema,
  type AssignDecision,
  AssignDecisionSchema,
} from '../workflows/assign-by-skill/schemas.ts';
import { applyAssignDecision } from '../workflows/assign-by-skill/workflow.ts';

const ProposeAssignmentInputSchema = z.object({
  taskId: z.string().uuid(),
  candidates: z
    .array(
      z.object({
        userId: z.string().uuid(),
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
    .min(2)
    .max(5),
  summary: z.string().max(500),
});

type ProposeAssignmentInput = z.infer<typeof ProposeAssignmentInputSchema>;

function buildCard(
  input: ProposeAssignmentInput,
  toolCallId: string,
  session: { tenantId: string; userId: string },
): ApprovalCard {
  const [top, ...rest] = input.candidates;
  return {
    toolCallId,
    intent: `Assign task ${input.taskId} based on agent reasoning`,
    riskBadge: 'write',
    summary: input.summary,
    details: [
      {
        kind: 'candidateList',
        items: input.candidates.map((c) => ({
          id: c.userId,
          label: c.userId,
          secondary: c.rationale,
          meta: { confidence: c.confidence, signals: c.signals ?? [] },
        })),
      },
    ],
    primary: top
      ? {
          label: `Assign to ${top.userId}`,
          argsPatch: { action: 'assign', assigneeUserIds: [top.userId] },
        }
      : { label: 'No candidates' },
    alternates: rest.map((c) => ({
      label: `Assign to ${c.userId}`,
      argsPatch: { action: 'assign', assigneeUserIds: [c.userId] },
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

/**
 * planner_proposeAssignment — agent surfaces 2-5 candidates it reasoned about
 * with per-candidate rationale and confidence. User picks one (assign) or
 * declines. Resumes guarded by INV-1: if the task was assigned between suspend
 * and resume, return `superseded` rather than double-writing.
 */
export const plannerProposeAssignmentTool = defineAgentTool({
  id: 'planner_proposeAssignment',
  name: 'Propose Assignment',
  description:
    'Surface 2-5 candidate assignees with per-candidate rationale and confidence. ' +
    'Use after gathering enough signal. User picks one (which triggers the assignment) or declines.',
  input: ProposeAssignmentInputSchema,
  output: AssignBySkillOutputSchema,
  suspendSchema: ApprovalCardSchema,
  resumeSchema: AssignDecisionSchema,
  rbac: 'planner.task.assign',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const resumeData = ctx.agent?.resumeData as AssignDecision | undefined;

    if (resumeData) {
      if (resumeData.action === 'assign') {
        const current = await getTask({ task_id: input.taskId, session });
        const currentAssigneeIds = current.assignees.map((a) => a.user_id);
        const requested = new Set(resumeData.assigneeUserIds);
        const drifted =
          currentAssigneeIds.length > 0 &&
          (currentAssigneeIds.length !== requested.size ||
            currentAssigneeIds.some((id) => !requested.has(id)));
        if (drifted) {
          return {
            kind: 'superseded' as const,
            taskId: input.taskId,
            currentAssigneeIds,
          };
        }
      }
      return applyAssignDecision(
        { taskId: input.taskId, decision: resumeData, session },
        { assignTask },
      );
    }

    const card = buildCard(input, ctx.agent?.toolCallId ?? 'unknown', {
      tenantId: session.tenant_id,
      userId: actor.user_id,
    });
    await ctx.agent?.suspend?.(card);
    return undefined;
  },
});
