import { RequestContext } from '@mastra/core/request-context';
import { actorFromContext, defineAgentTool, recordEntityExposure } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { applyLabelsByName } from '../domain/apply-labels-by-name.ts';
import { createTask } from '../domain/create-task.ts';
import {
  type DedupInput,
  DedupOutputSchema,
  TaskDraftSchema,
} from '../workflows/dedup-on-create/schemas.ts';

/**
 * planner_createTask — creates the task immediately, then triggers the
 * dedupOnCreate workflow to check for duplicates. If duplicates are found,
 * a HITL card appears with 3 options: Link / Delete / Leave.
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
      'Create a new task, then check for duplicates in the background.\n\n' +
      'Use for: "create a task for X"; "add \'fix login bug\' to plan Y".\n' +
      'Requires plan_id — get it from planner_findSimilarTasks results or the current plan context.\n' +
      'If duplicates are found, a HITL card appears with Link / Delete / Leave options.',
    input: TaskDraftSchema,
    output: DedupOutputSchema,
    rbac: 'planner.task.create',
    execute: async (draft, ctx) => {
      const actor = actorFromContext(ctx);

      // Step 1: Create the task immediately
      const parsedDraft = TaskDraftSchema.parse(draft);
      if (!parsedDraft.plan_id) {
        throw new Error('planner_createTask: plan_id is required');
      }

      const session = await buildActorSession({ user_id: actor.user_id });
      const task = await createTask({
        session,
        plan_id: parsedDraft.plan_id,
        bucket_id: parsedDraft.bucket_id,
        title: parsedDraft.title,
        description: parsedDraft.description,
      });

      // Skills are modeled as labels.
      await applyLabelsByName({
        plan_id: parsedDraft.plan_id,
        task_id: task.id,
        names: parsedDraft.labels,
        session,
      });

      await recordEntityExposure(ctx as never, {
        recentTasks: [{ taskId: task.id, title: parsedDraft.title }],
        lastDiscussedTaskId: task.id,
      });

      // Step 2: Start the dedupOnCreate workflow in background
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
        return { kind: 'kept' as const, taskId: task.id };
      }

      const workflow =
        mastra.getWorkflow('dedupOnCreate') ?? mastra.getWorkflow('planner.dedupOnCreate');
      if (!workflow) {
        return { kind: 'kept' as const, taskId: task.id };
      }

      const run = await workflow.createRun();

      // Build requestContext with actor info + thread_id for HITL in chat
      const requestContext = new RequestContext();
      requestContext.set('actor', { type: 'user' as const, user_id: actor.user_id });
      if (ctx.requestContext) {
        const tenantId = ctx.requestContext.get('tenant_id');
        if (tenantId) requestContext.set('tenant_id', tenantId);
        const roleSummary = ctx.requestContext.get('role_summary');
        if (roleSummary) requestContext.set('role_summary', roleSummary);
      }

      const dedupInput: DedupInput = {
        taskId: task.id,
        title: parsedDraft.title,
        description: parsedDraft.description ?? '',
        plan_id: parsedDraft.plan_id,
      };

      // Fire-and-forget: workflow handles dedup + HITL
      void run.start({ inputData: dedupInput, requestContext });

      return { kind: 'workflow-started' as const, runId: run.runId };
    },
  });
}
