import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { RequestContext } from '@mastra/core/request-context';
import {
  type AgentResult,
  buildAgentRequestContext,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
  temporalContextBlock,
} from '@seta/agent-sdk';
import { plannerQueryTasksTool } from '../../../agent-tools/query-tasks.ts';
import { pickModel } from '../../model.ts';
import {
  CollectorInputSchema,
  CollectorOutputSchema,
  type CollectorInput as In,
  type CollectorOutput as Out,
} from '../schemas.ts';

/**
 * Local logging wrapper — traces planner_queryTasks input before the call and
 * output/error after, without mutating the shared tool export (used elsewhere).
 * The Proxy overrides only `execute`; every other tool property passes through.
 */
const loggedQueryTasksTool = new Proxy(plannerQueryTasksTool, {
  get(target, prop, receiver) {
    if (prop !== 'execute') return Reflect.get(target, prop, receiver);
    const orig = Reflect.get(target, prop, receiver) as (...args: unknown[]) => Promise<unknown>;
    return async (...args: unknown[]) => {
      console.log('[planner_queryTasks] in:', JSON.stringify(args[0]));
      try {
        const result = await orig.apply(target, args);
        console.log('[planner_queryTasks] out:', JSON.stringify(result));
        return result;
      } catch (err) {
        console.error('[planner_queryTasks] throw:', err);
        throw err;
      }
    };
  },
});

export interface WeeklyPlanTaskCollectorDeps {
  resolveModel: () => MastraModelConfig;
  /** Test-only seam; production builds + runs a real Mastra Agent. */
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<Out>;
}

const buildInstructions = (now: Date) => `${temporalContextBlock(now)}

You collect the task list for a weekly plan. Decide the source:
- If the user's message itself contains a task list (bullet lines, numbered lines,
  or comma-separated items), parse THAT list. Do not call any tool.
- Otherwise call planner_queryTasks EXACTLY ONCE with
  { assigneeScope: "me", status: "open", limit: 50, dueBefore: "<DUE_BEFORE>" }
  where <DUE_BEFORE> is the exclusive upper bound printed as "dueBefore" on the
  Window line below. dueBefore is EXCLUSIVE (due_at < dueBefore), so this makes the
  DB drop tasks due after the window AT SOURCE. Never omit dueBefore; pass no other
  filters. Use the exact date given — do NOT recompute it.

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
Return only the structured object.
/no_think`;

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
      const rc = buildAgentRequestContext(ctx);

      const out = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            const model = pickModel(ctx, deps.resolveModel);
            // exclusive upper bound: day AFTER weekEnd, so tasks due ON weekEnd are kept
            const dueBefore = new Date(`${input.window.weekEnd}T00:00:00Z`);
            dueBefore.setUTCDate(dueBefore.getUTCDate() + 1);
            const dueBeforeIso = dueBefore.toISOString().slice(0, 10);
            const agent = new Agent({
              id: 'planner.weeklyPlan.taskCollector',
              name: 'Weekly Plan Task Collector',
              instructions: buildInstructions(new Date()),
              model,
              tools: { planner_queryTasks: loggedQueryTasksTool } as never,
            });
            const stream = await agent.stream(
              [
                `Window: ${JSON.stringify(input.window)} (dueBefore ${dueBeforeIso})`,
                `User request: ${input.userText}`,
              ].join('\n'),
              {
                // Free tool-choice: the model decides whether to call
                // planner_queryTasks (and authors its args from INSTRUCTIONS,
                // incl. assigneeScope: "me") vs. parsing a pasted list. Forcing
                // toolChoice made the model emit empty args, dropping the
                // optional assigneeScope so the query silently ran unscoped.
                structuredOutput: { schema: CollectorOutputSchema, model },
                maxSteps: 5,
                requestContext: rc,
                abortSignal: ctx.abortSignal,
              },
            );
            const object = await stream.object;
            if (!object) throw new Error('task collection returned no structured output');
            return object;
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
