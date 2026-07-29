import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';
import {
  type AgentResult,
  type AgentTool,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
  withTemporalContext,
} from '@seta/agent-sdk';
import type { ChatStreamRun } from '@seta/shared-orchestration';
import { z } from 'zod';
import { pickModel } from '../model.ts';
import { makeWeeklyPlanTools, newWeeklyPlanTurnState } from './orchestrator.tools.ts';
import { resolvePlanWindow, resolveWeekChoice, windowDays } from './scheduling.ts';
import type {
  BuilderInput,
  BuilderOutput,
  CollectorInput,
  CollectorOutput,
  InsightInput,
  InsightOutput,
} from './schemas.ts';

export const WeeklyPlanOrchestratorInputSchema = z.object({
  userText: z.string(),
  taskId: z.string().nullable(),
});
export type WeeklyPlanOrchestratorInput = z.infer<typeof WeeklyPlanOrchestratorInputSchema>;

export const WeeklyPlanOrchestratorResultSchema = z.object({ answer: z.string() });
export type WeeklyPlanOrchestratorResult = z.infer<typeof WeeklyPlanOrchestratorResultSchema>;

export interface WeeklyPlanOrchestratorDeps {
  collector: SpecializedAgentSpec<CollectorInput, CollectorOutput>;
  builder: SpecializedAgentSpec<BuilderInput, BuilderOutput>;
  insighter: SpecializedAgentSpec<InsightInput, InsightOutput>;
  resolveModel: () => MastraModelConfig;
  /** Injectable clock so tests can pin the window. */
  now?: () => Date;
  /** Test seam — replaces agent.stream(); returns a minimal output with `.text`. */
  streamAgent?: (args: {
    message: string;
    requestContext: RequestContext;
    tools: Record<string, AgentTool>;
  }) => { text: Promise<string> };
}

const INSTRUCTIONS = `You are the weekly planner orchestrator. You turn the user's
tasks into a day-by-day plan for the planning window, then answer in markdown.

Always work in this order:
1. planner_collectWeekTasks with the user's request.
   - If it returns zero tasks: answer that there is nothing to plan for that window,
     suggest pasting a task list, and STOP — do not call the other tools.
2. planner_buildWeekSchedule.
3. planner_generatePlanInsights.
4. Final answer in markdown:
   - One "### <Day>" heading per window day that has work, in window order; under
     each, its focus blocks as "**<label>**" with the tasks as bullets.
   - An "### Insights" section listing every insight.
   - If the schedule carried a caveat, state it in one line.
   - Briefly note any assumed priorities or due dates.
   - If fewer than 3 tasks were collected, still plan them and note the list is small.
This is READ-ONLY planning advice: never claim to have created, moved, assigned, or
changed anything. Never invent tasks the collector did not return. The planning
window is fixed by the system — do not plan days outside it.`;

interface BuiltWeeklyPlanOrchestrator {
  agent: Agent;
  message: string;
  rc: RequestContext;
  tools: Record<string, AgentTool>;
}

function buildWeeklyPlanOrchestrator(
  deps: WeeklyPlanOrchestratorDeps,
  input: WeeklyPlanOrchestratorInput,
  ctx: SpecializedAgentRunCtx,
): BuiltWeeklyPlanOrchestrator {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
  rc.set('tenant_id', ctx.tenantId);
  rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());

  // Deterministic window resolution — before any LLM sees the turn.
  const week = resolveWeekChoice(input.userText);
  const window = resolvePlanWindow((deps.now ?? (() => new Date()))(), week);

  const tools = makeWeeklyPlanTools({
    collector: deps.collector,
    builder: deps.builder,
    insighter: deps.insighter,
    window,
    ctx,
    state: newWeeklyPlanTurnState(),
  }) as unknown as Record<string, AgentTool>;

  const agent = new Agent({
    id: 'planner.weeklyPlan.orchestrator',
    name: 'Weekly Planner Orchestrator',
    instructions: withTemporalContext(INSTRUCTIONS, { now: deps.now?.() }),
    model: pickModel(ctx, deps.resolveModel),
    tools: tools as never,
  });

  const message = [
    `Planning window: ${windowDays(window).join(', ')} (${window.weekStart} to ${window.weekEnd}, ${week} week).`,
    `User request: ${input.userText}`,
  ].join('\n');

  return { agent, message, rc, tools };
}

const EMPTY_TRUST = { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.6 };

/** Non-streaming spec (queued runner / direct call). */
export function makeWeeklyPlanOrchestrator(
  deps: WeeklyPlanOrchestratorDeps,
): SpecializedAgentSpec<WeeklyPlanOrchestratorInput, WeeklyPlanOrchestratorResult> {
  return {
    id: 'planner.weeklyPlan.orchestrator',
    description:
      'Turns the user’s tasks into a Mon–Fri (or remaining-days) plan with focus blocks and insights, via collector/builder/insight sub-agents.',
    inputSchema: WeeklyPlanOrchestratorInputSchema,
    outputSchema: WeeklyPlanOrchestratorResultSchema,
    run: async (input, ctx): Promise<AgentResult<WeeklyPlanOrchestratorResult>> => {
      const built = buildWeeklyPlanOrchestrator(deps, input, ctx);
      const text = deps.streamAgent
        ? await deps.streamAgent({
            message: built.message,
            requestContext: built.rc,
            tools: built.tools,
          }).text
        : (
            await built.agent.generate(built.message, {
              requestContext: built.rc,
              abortSignal: ctx.abortSignal,
            })
          ).text;
      const answer = text?.trim() ?? '';
      return { result: { answer }, trust: { ...EMPTY_TRUST, confidenceScore: answer ? 0.6 : 0.2 } };
    },
  };
}

/** Streaming entry — the chat route consumes the returned ChatStreamRun. */
export function makeWeeklyPlanChatStreamer(deps: WeeklyPlanOrchestratorDeps) {
  return async function startWeeklyPlanChat(
    input: WeeklyPlanOrchestratorInput,
    ctx: SpecializedAgentRunCtx,
  ): Promise<ChatStreamRun> {
    const built = buildWeeklyPlanOrchestrator(deps, input, ctx);

    if (deps.streamAgent) {
      const fake = deps.streamAgent({
        message: built.message,
        requestContext: built.rc,
        tools: built.tools,
      });
      return {
        output: fake as unknown as ChatStreamRun['output'],
        finalize: async () => {
          const answer = (await fake.text)?.trim() ?? '';
          return {
            result: { answer },
            trust: { ...EMPTY_TRUST, confidenceScore: answer ? 0.6 : 0.2 },
          };
        },
      };
    }

    const output = await built.agent.stream(built.message, {
      requestContext: built.rc,
      abortSignal: ctx.abortSignal,
    });
    return {
      output: output as unknown as ChatStreamRun['output'],
      finalize: async () => {
        const answer = (await (output as unknown as { text: Promise<string> }).text)?.trim() ?? '';
        return {
          result: { answer },
          trust: { ...EMPTY_TRUST, confidenceScore: answer ? 0.6 : 0.2 },
        };
      },
    };
  };
}
