import type { MastraModelConfig } from '@mastra/core/llm';
import { type AgentTool, SpecializedAgentRegistry } from '@seta/agent-sdk';
import { type ChatStreamRun, OrchestrationRegistry, type RunCtx } from '@seta/shared-orchestration';
import {
  makeQueryGeneralAnswerAgent,
  makeQueryTaskDetailAgent,
  makeQueryTaskSearchAgent,
  makeQueryTeamInfoAgent,
} from './agents/index.ts';
import {
  makeQueryChatStreamer,
  makeQueryOrchestrator,
  type QueryOrchestratorDeps,
} from './orchestrator.ts';
import { queryOrchestratorSpec } from './orchestrator-spec.ts';

export interface PlannerQueryRuntimeDeps {
  resolveModel: () => MastraModelConfig;
  /** Built find-similar tool (factory needs provider + databaseUrl). */
  findSimilarTasksTool: AgentTool;
  /** Test seam forwarded to the orchestrator streamer. */
  streamAgent?: QueryOrchestratorDeps['streamAgent'];
}

export interface PlannerQueryRuntime {
  runStream: (
    runInput: { userText: string; taskId: string | null },
    ctx: RunCtx,
  ) => Promise<ChatStreamRun>;
}

export function buildPlannerQueryRuntime(deps: PlannerQueryRuntimeDeps): PlannerQueryRuntime {
  const taskSearch = makeQueryTaskSearchAgent({
    resolveModel: deps.resolveModel,
    findSimilarTasksTool: deps.findSimilarTasksTool,
  });
  const taskDetail = makeQueryTaskDetailAgent({ resolveModel: deps.resolveModel });
  const teamInfo = makeQueryTeamInfoAgent({ resolveModel: deps.resolveModel });
  const generalAnswer = makeQueryGeneralAnswerAgent({ resolveModel: deps.resolveModel });

  const orchestratorDeps: QueryOrchestratorDeps = {
    taskQuery: taskSearch,
    taskDetail,
    teamInfo,
    generalAnswer,
    resolveModel: deps.resolveModel,
    streamAgent: deps.streamAgent,
  };

  const orchestrator = makeQueryOrchestrator(orchestratorDeps);
  SpecializedAgentRegistry.register(orchestrator);
  OrchestrationRegistry.register(queryOrchestratorSpec);

  const runStream = makeQueryChatStreamer(orchestratorDeps);
  return { runStream };
}
