import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────────
// Shared item schema — reused in input and output.
// ──────────────────────────────────────────────────────────────────────────────

const TaskSkillItemSchema = z.object({
  task_id: z.string().uuid(),
  title: z.string(),
  skills: z.array(z.string()),
});

export type TaskSkillItem = z.infer<typeof TaskSkillItemSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// Enqueue result returned by the queue backend.
// ──────────────────────────────────────────────────────────────────────────────

export type EnqueueResult = {
  job_id: string;
  queue: string;
  enqueued_at: string; // ISO-8601
};

// ──────────────────────────────────────────────────────────────────────────────
// Dependency contract
//
// Caller injects `enqueueForOrchestrator` — the implementation decides the
// underlying transport (graphile-worker job, domain event, HTTP call, etc.).
// The tool itself is decoupled from the transport layer.
// ──────────────────────────────────────────────────────────────────────────────

export type BuildTaskSkillQueueDeps = {
  enqueueForOrchestrator: (params: {
    payload: TaskSkillItem[];
    enqueuedBy: string; // actor.user_id — for audit trail in the job
  }) => Promise<EnqueueResult>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Tool
//
// Tool 3 (final) of the TaskAnalyzer pipeline.
//
// After all tasks have been processed by planner_extractSkillsFromTask, this
// tool aggregates the results and PUSHES them to the Orchestrator queue.
// The Orchestrator receives the job and decides the next routing step
// (SkillMatcher, AvaiChecker, etc.) — it is NOT called directly from here.
// ──────────────────────────────────────────────────────────────────────────────

export function makePlannerBuildTaskSkillQueueTool(deps: BuildTaskSkillQueueDeps) {
  return defineCopilotTool({
    id: 'planner_buildTaskSkillQueue',
    name: 'Build Task Skill Queue',
    description: `
Final step of the TaskAnalyzer pipeline.

Aggregates all task-skill pairs from planner_extractSkillsFromTask and pushes
the result to the Orchestrator queue. The Orchestrator then decides the next
routing step independently — this tool does NOT call SkillMatcher directly.

Call this ONCE after planner_extractSkillsFromTask has been called for every
task returned by planner_filterTasksByTagAndStatus.
      `.trim(),

    input: z.object({
      items: z
        .array(TaskSkillItemSchema)
        .min(1)
        .describe(
          'All task-skill pairs collected from planner_extractSkillsFromTask. ' +
            'Include every task — do not omit tasks with few skills.',
        ),
    }),

    output: z.object({
      // Enqueue confirmation from the queue backend.
      job_id: z.string().describe('Job ID assigned by the queue backend.'),
      queue: z.string().describe('Queue name the job was pushed to.'),
      enqueued_at: z.string().describe('ISO-8601 timestamp of enqueue.'),
      // Summary for TrustLayer / logging.
      item_count: z.number().int(),
      total_skills_extracted: z.number().int(),
    }),

    rbac: 'planner.task.read',

    execute: async (input, ctx) => {
      const actor = actorFromContext(ctx);

      const total_skills_extracted = input.items.reduce((sum, item) => sum + item.skills.length, 0);

      // Push to Orchestrator queue — transport decided by the injected dep.
      const result = await deps.enqueueForOrchestrator({
        payload: input.items,
        enqueuedBy: actor.user_id,
      });

      return {
        job_id: result.job_id,
        queue: result.queue,
        enqueued_at: result.enqueued_at,
        item_count: input.items.length,
        total_skills_extracted,
      };
    },
  });
}
