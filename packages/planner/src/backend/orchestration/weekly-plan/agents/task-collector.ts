import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentResult, SpecializedAgentRunCtx, SpecializedAgentSpec } from '@seta/agent-sdk';
import { plannerQueryTasksTool } from '../../../agent-tools/query-tasks.ts';
import { pickModel } from '../../model.ts';
import {
  CollectorInputSchema,
  CollectorOutputSchema,
  type CollectorInput as In,
  type CollectorOutput as Out,
} from '../schemas.ts';

export interface WeeklyPlanTaskCollectorDeps {
  resolveModel: () => MastraModelConfig;
  /** Test-only seam; production builds + runs a real Mastra Agent. */
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<Out>;
}

const INSTRUCTIONS = `You collect the task list for a weekly plan. Decide the source:
- If the user's message itself contains a task list (bullet lines, numbered lines,
  or comma-separated items), parse THAT list. Do not call any tool.
- Otherwise call planner_queryTasks EXACTLY ONCE with
  { assigneeScope: "me", status: "open", limit: 50 } and nothing else — no due filters.

Then normalize into tasks[]:
- Keep tasks due inside the window (weekStart..weekEnd), tasks due BEFORE weekStart
  (set overdue: true), and tasks with no due date. Drop tasks due after weekEnd.
- priority: take it from the source; when the source states none, use "medium" and
  set priorityAssumed: true.
- dueAt: ISO date from the source or null; when null set dueAssumed: true. Never
  invent a date the source did not state.
- Keep taskId for tasks that came from planner_queryTasks; omit it for pasted tasks.
- If the conversation already contains a plan and the user is adding or editing
  tasks mid-week, merge: the previously planned tasks plus the stated changes.
- If more than 20 tasks remain, keep the 20 with the earliest due dates, then the
  highest priority, and drop the rest.
Return only the structured object.`;

export function makeWeeklyPlanTaskCollector(
  deps: WeeklyPlanTaskCollectorDeps,
): SpecializedAgentSpec<In, Out> {
  return {
    id: 'planner.weeklyPlan.taskCollector',
    description:
      'Collects and normalizes the task list for a weekly plan — from pasted text or the caller’s open planner tasks — window-filtered with overdue/assumed flags.',
    inputSchema: CollectorInputSchema,
    outputSchema: CollectorOutputSchema,
    run: async (input, ctx: SpecializedAgentRunCtx): Promise<AgentResult<Out>> => {
      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
      rc.set('tenant_id', ctx.tenantId);
      rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());

      const out = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            const agent = new Agent({
              id: 'planner.weeklyPlan.taskCollector',
              name: 'Weekly Plan Task Collector',
              instructions: INSTRUCTIONS,
              model: pickModel(ctx, deps.resolveModel),
              tools: { planner_queryTasks: plannerQueryTasksTool } as never,
            });
            const r = await agent.generate(
              [`Window: ${JSON.stringify(input.window)}`, `User request: ${input.userText}`].join(
                '\n',
              ),
              {
                structuredOutput: { schema: CollectorOutputSchema },
                requestContext: rc,
                abortSignal: ctx.abortSignal,
              },
            );
            if (!r.object) throw new Error('task collection returned no structured output');
            return r.object;
          })();

      const tasks = out.tasks ?? [];
      return {
        result: { tasks },
        trust: {
          reasoningTrace: [],
          evidenceCitations: [],
          confidenceScore: tasks.length > 0 ? 0.6 : 0.3,
        },
      };
    },
  };
}
