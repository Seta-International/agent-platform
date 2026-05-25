import type { PgVector } from '@mastra/pg';
import { ApprovalCardSchema, actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { buildActorSession } from '@seta/identity';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import { z } from 'zod';
import { assignTask } from '../domain/assign-task.ts';
import { getPlannerVectorStore } from '../embeddings/vector-store.ts';
import {
  AssignBySkillOutputSchema,
  type AssignDecision,
  AssignDecisionSchema,
} from '../workflows/assign-by-skill/schemas.ts';
import {
  type AssignBySkillDeps,
  applyAssignDecision,
  runSuggestAssignee,
} from '../workflows/assign-by-skill/workflow.ts';

export interface PlannerSuggestAssigneeDeps {
  provider: EmbeddingProvider;
  databaseUrl?: string;
  pgVector?: PgVector;
}

const inputSchema = z.object({
  taskId: z.string().uuid().describe('The task to suggest an assignee for'),
});

/**
 * planner_suggestAssignee — single-call HITL flow.
 *
 * 1. loadTask + 3-branch candidatePool (exact / vector / history)
 * 2. pre-rank by cheap signals → enrich top-10 with cross-module reads
 * 3. final rank (PM-aware: priority + due-urgency modulate weights) → top-5
 * 4. suspend with ApprovalCard; user picks assign / leave-unassigned / decline
 * 5. resume → planner_assignTask write tool (assign branch) or no-op
 *
 * HITL is the approval for the downstream write — no double-approval (spec
 * §8.3). The argsPatch on each candidate row matches the assigneeUserId field
 * planner_assignTask reads.
 */
export function plannerSuggestAssigneeTool(deps: PlannerSuggestAssigneeDeps) {
  const reranker = resolveReranker();
  const resolvePgVector = (): PgVector => {
    if (deps.pgVector) return deps.pgVector;
    if (!deps.databaseUrl) {
      throw new Error('planner_suggestAssignee: pgVector or databaseUrl required');
    }
    return getPlannerVectorStore(deps.databaseUrl);
  };

  return defineCopilotTool({
    id: 'planner_suggestAssignee',
    name: 'Suggest Assignee',
    description:
      'Suggest an assignee for a task by combining exact skill overlap, vector ' +
      'skill match, task history, current load, capacity, and timezone. Surfaces ' +
      'top-5 candidates via HITL; user picks (assign / leave-unassigned / decline).',
    input: inputSchema,
    output: AssignBySkillOutputSchema,
    suspendSchema: ApprovalCardSchema,
    resumeSchema: AssignDecisionSchema,
    rbac: 'planner.task.assign',
    execute: async (input, ctx) => {
      const actor = actorFromContext(ctx);
      const session = await buildActorSession(actor);
      const resumeData = ctx.agent?.resumeData as AssignDecision | undefined;

      if (resumeData) {
        return applyAssignDecision(
          {
            taskId: input.taskId,
            decision: resumeData,
            session,
          },
          { assignTask },
        );
      }

      const workflowDeps: AssignBySkillDeps = {
        provider: deps.provider,
        pgVector: resolvePgVector(),
        reranker,
      };
      const { card } = await runSuggestAssignee(
        {
          taskId: input.taskId,
          session: { tenantId: session.tenant_id, userId: actor.user_id },
          toolCallId: ctx.agent?.toolCallId ?? 'unknown',
        },
        workflowDeps,
      );
      await ctx.agent?.suspend?.(card);
      // Unreachable in practice — Mastra throws/returns after suspend.
      return undefined;
    },
  });
}
