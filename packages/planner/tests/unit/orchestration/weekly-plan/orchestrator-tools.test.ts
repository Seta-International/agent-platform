import { RequestContext } from '@mastra/core/request-context';
import type { SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import {
  makeWeeklyPlanTools,
  newWeeklyPlanTurnState,
} from '../../../../src/backend/orchestration/weekly-plan/orchestrator.tools.ts';
import type {
  BuilderInput,
  BuilderOutput,
  CollectorInput,
  CollectorOutput,
  InsightInput,
  InsightOutput,
  PlanWindow,
} from '../../../../src/backend/orchestration/weekly-plan/schemas.ts';

const WED_FRI: PlanWindow = {
  startDay: 'wed',
  endDay: 'fri',
  weekStart: '2026-07-08',
  weekEnd: '2026-07-10',
};

const trust = { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.6 };

const collector: SpecializedAgentSpec<CollectorInput, CollectorOutput> = {
  id: 'planner.weeklyPlan.taskCollector',
  description: 'test',
  inputSchema: {} as never,
  outputSchema: {} as never,
  run: async (input) => ({
    result: {
      tasks: [
        {
          title: `from:${input.userText}`,
          priority: 'medium',
          priorityAssumed: true,
          dueAt: null,
          dueAssumed: true,
          overdue: false,
        },
      ],
    },
    trust,
  }),
};

const builder: SpecializedAgentSpec<BuilderInput, BuilderOutput> = {
  id: 'planner.weeklyPlan.scheduleBuilder',
  description: 'test',
  inputSchema: {} as never,
  outputSchema: {} as never,
  run: async (input) => ({
    result: {
      plan: {
        days: [
          { day: 'wed', blocks: [{ label: 'Focus', taskTitles: input.tasks.map((t) => t.title) }] },
        ],
        unplaced: [],
      },
      caveat: null,
    },
    trust,
  }),
};

const insighter: SpecializedAgentSpec<InsightInput, InsightOutput> = {
  id: 'planner.weeklyPlan.insightGenerator',
  description: 'test',
  inputSchema: {} as never,
  outputSchema: {} as never,
  run: async () => ({
    result: { insights: [{ kind: 'workload', text: 'even' }] },
    trust,
  }),
};

function build() {
  const state = newWeeklyPlanTurnState();
  const tools = makeWeeklyPlanTools({
    collector,
    builder,
    insighter,
    window: WED_FRI,
    ctx: { tenantId: 't1', actorUserId: 'u1' },
    state,
  });
  return { state, tools };
}

// defineAgentTool wraps Mastra createTool — execute validates the request context
// (actor + tenant). We call it the way the qna orchestrator-tools test does: with the
// input object and a { requestContext } second arg.
const exec = async (tool: unknown, input: object) => {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: 'u1' });
  rc.set('tenant_id', 't1');
  return (tool as { execute: (i: object, c?: unknown) => Promise<unknown> }).execute(input, {
    requestContext: rc,
  } as never);
};

describe('weekly-plan delegation tools', () => {
  it('collect → build → insights flows through shared state', async () => {
    const { state, tools } = build();

    const collected = (await exec(tools.planner_collectWeekTasks, {
      request: 'plan my week',
    })) as { taskCount: number };
    expect(collected.taskCount).toBe(1);
    expect(state.tasks).toHaveLength(1);

    const built = (await exec(tools.planner_buildWeekSchedule, {})) as {
      plan: { days: unknown[] };
    };
    expect(built.plan.days).toHaveLength(1);
    expect(state.plan).not.toBeNull();

    const insights = (await exec(tools.planner_generatePlanInsights, {})) as {
      insights: { kind: string }[];
    };
    expect(insights.insights[0]!.kind).toBe('workload');
  });

  it('build before collect returns an actionable error message', async () => {
    const { tools } = build();
    await expect(exec(tools.planner_buildWeekSchedule, {})).rejects.toThrow(
      /planner_collectWeekTasks first/,
    );
  });

  it('insights before build returns an actionable error message', async () => {
    const { tools } = build();
    await expect(exec(tools.planner_generatePlanInsights, {})).rejects.toThrow(
      /planner_buildWeekSchedule first/,
    );
  });
});
