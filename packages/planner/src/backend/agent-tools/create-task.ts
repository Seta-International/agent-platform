import {
  type ApprovalCard,
  ApprovalCardSchema,
  actorFromContext,
  defineCopilotTool,
} from '@seta/copilot-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { DedupOutputSchema, TaskDraftSchema } from '../workflows/dedup-on-create/schemas.ts';
import { applyDupDecision } from '../workflows/dedup-on-create/workflow.ts';

const ResumeSchema = z.object({ action: z.enum(['confirm', 'cancel']) });

/**
 * planner_createTask — thin confirm-and-create. Dedup is the agent's
 * responsibility: the playbook tells the specialist to call
 * planner_findSimilarTasks first. If the user still wants to create, the
 * agent calls this tool, which surfaces a confirm card and writes on resume.
 */
export interface PlannerCreateTaskDeps {
  // Kept for API parity with previous shape; the runtime no longer needs these.
  provider?: unknown;
  databaseUrl?: unknown;
}

export function plannerCreateTaskTool(_deps?: PlannerCreateTaskDeps) {
  return defineCopilotTool({
    id: 'planner_createTask',
    name: 'Create Task',
    description:
      'Create a task. Surfaces a confirm card with the proposed task; user clicks to commit. ' +
      'Check for duplicates first by calling planner_findSimilarTasks (per the specialist playbook).',
    input: TaskDraftSchema,
    output: DedupOutputSchema,
    suspendSchema: ApprovalCardSchema,
    resumeSchema: ResumeSchema,
    rbac: 'planner.task.create',
    execute: async (draft, ctx) => {
      const actor = actorFromContext(ctx);
      const session = await buildActorSession(actor);
      const resumeData = ctx.agent?.resumeData as z.infer<typeof ResumeSchema> | undefined;

      if (resumeData?.action === 'confirm') {
        return applyDupDecision({
          draft: TaskDraftSchema.parse(draft),
          action: { kind: 'create-new' },
          session,
        });
      }
      if (resumeData?.action === 'cancel') return { kind: 'cancelled' as const };

      const card: ApprovalCard = {
        toolCallId: ctx.agent?.toolCallId ?? 'unknown',
        intent: 'Create this task',
        riskBadge: 'write',
        summary: `Create "${draft.title}"`,
        details: draft.description
          ? [{ kind: 'text', body: draft.description }]
          : [{ kind: 'text', body: '(no description)' }],
        primary: { label: 'Create', argsPatch: { action: 'confirm' } },
        alternates: [],
        decline: { label: 'Cancel' },
        meta: {
          tenantId: session.tenant_id,
          userId: actor.user_id,
          agentPath: ['supervisor', 'work', 'planner'],
          toolId: 'planner_createTask',
          ts: new Date().toISOString(),
        },
      };
      await ctx.agent?.suspend?.(card);
      return undefined;
    },
  });
}
