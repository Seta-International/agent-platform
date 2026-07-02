import {
  AgentToolError,
  defineAgentTool,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
} from '@seta/agent-sdk';
import { z } from 'zod';
import {
  type BuilderInput,
  type BuilderOutput,
  type CollectorInput,
  type CollectorOutput,
  type Insight,
  type InsightInput,
  type InsightOutput,
  InsightSchema,
  type NormalizedTask,
  type PlanWindow,
  type WeeklyPlan,
  WeeklyPlanSchema,
} from './schemas.ts';

/** Per-turn scratch shared by the three delegation tools so task arrays flow
 *  tool→tool without round-tripping through LLM arguments. Read-only flow —
 *  nothing here persists beyond the turn. */
export interface WeeklyPlanTurnState {
  tasks: NormalizedTask[] | null;
  plan: WeeklyPlan | null;
  caveat: string | null;
  insights: Insight[] | null;
}

export function newWeeklyPlanTurnState(): WeeklyPlanTurnState {
  return { tasks: null, plan: null, caveat: null, insights: null };
}

export interface WeeklyPlanToolDeps {
  collector: SpecializedAgentSpec<CollectorInput, CollectorOutput>;
  builder: SpecializedAgentSpec<BuilderInput, BuilderOutput>;
  insighter: SpecializedAgentSpec<InsightInput, InsightOutput>;
  /** Resolved deterministically by the streamer before any LLM runs. */
  window: PlanWindow;
  ctx: SpecializedAgentRunCtx;
  state: WeeklyPlanTurnState;
}

export function makeWeeklyPlanTools(deps: WeeklyPlanToolDeps) {
  const { ctx, state, window } = deps;
  const subCtx: SpecializedAgentRunCtx = {
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    effectivePermissions: ctx.effectivePermissions,
    abortSignal: ctx.abortSignal,
    model: ctx.model,
  };

  return {
    planner_collectWeekTasks: defineAgentTool({
      id: 'planner_collectWeekTasks',
      name: 'Collect Week Tasks',
      description:
        'Step 1 — collect and normalize the tasks to plan (from the pasted list or the ' +
        'user’s open planner tasks, window-filtered). Always call this first.',
      input: z.object({
        request: z.string().describe("The user's planning request, verbatim."),
      }),
      output: z.object({
        taskCount: z.number().int(),
        tasks: z.array(
          z.object({
            title: z.string(),
            priority: z.string(),
            dueAt: z.string().nullable(),
            overdue: z.boolean(),
          }),
        ),
      }),
      execute: async ({ request }) => {
        const res = await deps.collector.run({ userText: request, window }, subCtx);
        state.tasks = res.result.tasks;
        return {
          taskCount: state.tasks.length,
          tasks: state.tasks.map((t) => ({
            title: t.title,
            priority: t.priority,
            dueAt: t.dueAt,
            overdue: t.overdue,
          })),
        };
      },
    }),

    planner_buildWeekSchedule: defineAgentTool({
      id: 'planner_buildWeekSchedule',
      name: 'Build Week Schedule',
      description:
        'Step 2 — place the collected tasks onto the window days with focus blocks. ' +
        'Requires planner_collectWeekTasks to have run in this turn.',
      input: z.object({}),
      output: z.object({ plan: WeeklyPlanSchema, caveat: z.string().nullable() }),
      execute: async () => {
        if (!state.tasks) {
          throw new AgentToolError({
            code: 'VALIDATION',
            retryable: false,
            userMessage: 'No tasks collected yet — call planner_collectWeekTasks first.',
            internalDetail: 'planner_buildWeekSchedule invoked before planner_collectWeekTasks',
            toolId: 'planner_buildWeekSchedule',
          });
        }
        const res = await deps.builder.run({ tasks: state.tasks, window }, subCtx);
        state.plan = res.result.plan;
        state.caveat = res.result.caveat;
        return { plan: state.plan, caveat: state.caveat };
      },
    }),

    planner_generatePlanInsights: defineAgentTool({
      id: 'planner_generatePlanInsights',
      name: 'Generate Plan Insights',
      description:
        'Step 3 — produce 1-3 insights (risk / workload / focus) for the built plan. ' +
        'Requires planner_buildWeekSchedule to have run in this turn.',
      input: z.object({}),
      output: z.object({ insights: z.array(InsightSchema) }),
      execute: async () => {
        if (!state.plan || !state.tasks) {
          throw new AgentToolError({
            code: 'VALIDATION',
            retryable: false,
            userMessage: 'No schedule built yet — call planner_buildWeekSchedule first.',
            internalDetail: 'planner_generatePlanInsights invoked before planner_buildWeekSchedule',
            toolId: 'planner_generatePlanInsights',
          });
        }
        const res = await deps.insighter.run({ plan: state.plan, tasks: state.tasks }, subCtx);
        state.insights = res.result.insights;
        return { insights: state.insights };
      },
    }),
  };
}
