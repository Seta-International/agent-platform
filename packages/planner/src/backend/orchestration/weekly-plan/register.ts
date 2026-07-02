import type { MastraModelConfig } from '@mastra/core/llm';
import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { type ChatStreamRun, OrchestrationRegistry, type RunCtx } from '@seta/shared-orchestration';
import {
  makeWeeklyPlanInsightGenerator,
  makeWeeklyPlanScheduleBuilder,
  makeWeeklyPlanTaskCollector,
} from './agents/index.ts';
import {
  makeWeeklyPlanChatStreamer,
  makeWeeklyPlanOrchestrator,
  type WeeklyPlanOrchestratorDeps,
} from './orchestrator.ts';
import { weeklyPlanOrchestratorSpec } from './orchestrator-spec.ts';

export interface WeeklyPlanRuntimeDeps {
  resolveModel: () => MastraModelConfig;
  /** Injectable clock forwarded to the orchestrator (tests pin the window). */
  now?: () => Date;
  /** Test seam forwarded to the orchestrator streamer. */
  streamAgent?: WeeklyPlanOrchestratorDeps['streamAgent'];
}

export interface WeeklyPlanRuntime {
  runStream: (
    runInput: { userText: string; taskId: string | null },
    ctx: RunCtx,
  ) => Promise<ChatStreamRun>;
}

export function buildWeeklyPlanRuntime(deps: WeeklyPlanRuntimeDeps): WeeklyPlanRuntime {
  const orchestratorDeps: WeeklyPlanOrchestratorDeps = {
    collector: makeWeeklyPlanTaskCollector({ resolveModel: deps.resolveModel }),
    builder: makeWeeklyPlanScheduleBuilder({ resolveModel: deps.resolveModel }),
    insighter: makeWeeklyPlanInsightGenerator({ resolveModel: deps.resolveModel }),
    resolveModel: deps.resolveModel,
    now: deps.now,
    streamAgent: deps.streamAgent,
  };

  const orchestrator = makeWeeklyPlanOrchestrator(orchestratorDeps);
  SpecializedAgentRegistry.register(orchestrator);
  OrchestrationRegistry.register(weeklyPlanOrchestratorSpec);

  const runStream = makeWeeklyPlanChatStreamer(orchestratorDeps);
  return { runStream };
}
