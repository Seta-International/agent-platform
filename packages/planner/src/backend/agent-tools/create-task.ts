import { RequestContext } from '@mastra/core/request-context';
import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { DedupOutputSchema, TaskDraftSchema } from '../workflows/dedup-on-create/schemas.ts';

/**
 * planner_createTask — triggers the dedupOnCreate workflow which handles
 * duplicate detection, HITL approval (when duplicates are found), and task
 * creation. The workflow appears in the Workflows UI for tracking.
 */
export interface PlannerCreateTaskDeps {
  provider?: unknown;
  databaseUrl?: unknown;
}

export function plannerCreateTaskTool(_deps?: PlannerCreateTaskDeps) {
  return defineAgentTool({
    id: 'planner_createTask',
    name: 'Create Task',
    description:
      'Create a task via the dedupOnCreate workflow. The workflow checks for duplicates first; ' +
      'if duplicates are found, it surfaces a HITL approval card in the inbox. ' +
      'Check for duplicates first by calling planner_findSimilarTasks (per the specialist playbook).',
    input: TaskDraftSchema,
    output: DedupOutputSchema,
    rbac: 'planner.task.create',
    execute: async (draft, ctx) => {
      const actor = actorFromContext(ctx);

      // Access Mastra runtime to start the dedupOnCreate workflow
      const mastra = ctx.mastra as
        | {
            getWorkflow: (id: string) =>
              | {
                  createRun: () => Promise<{
                    runId: string;
                    start: (opts: { inputData: unknown; requestContext: unknown }) => Promise<void>;
                  }>;
                }
              | undefined;
          }
        | undefined;

      if (!mastra) {
        throw new Error('planner_createTask: Mastra runtime unavailable — cannot start workflow');
      }

      const workflow =
        mastra.getWorkflow('dedupOnCreate') ?? mastra.getWorkflow('planner.dedupOnCreate');
      if (!workflow) {
        throw new Error('planner_createTask: dedupOnCreate workflow not registered');
      }

      const parsedDraft = TaskDraftSchema.parse(draft);
      const run = await workflow.createRun();

      // Build requestContext with actor info for the workflow steps
      const requestContext = new RequestContext();
      requestContext.set('actor', { type: 'user' as const, user_id: actor.user_id });
      if (ctx.requestContext) {
        const tenantId = ctx.requestContext.get('tenant_id');
        if (tenantId) requestContext.set('tenant_id', tenantId);
        const roleSummary = ctx.requestContext.get('role_summary');
        if (roleSummary) requestContext.set('role_summary', roleSummary);
      }

      // Fire-and-forget: the workflow runs async and handles dedup + HITL via inbox
      void run.start({ inputData: parsedDraft, requestContext });

      return { kind: 'workflow-started' as const, runId: run.runId };
    },
  });
}
