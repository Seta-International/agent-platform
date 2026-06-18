import type { MastraModelConfig } from '@mastra/core/llm';
import { type AgentTool, SpecializedAgentRegistry } from '@seta/agent-sdk';
import { type ChatStreamRun, OrchestrationRegistry, type RunCtx } from '@seta/shared-orchestration';
import {
  makeQnaGeneralAnswerAgent,
  makeQnaTaskDetailAgent,
  makeQnaTaskQueryAgent,
  makeQnaTeamInfoAgent,
} from './agents/index.ts';
import {
  makeQnaChatStreamer,
  makeQnaOrchestrator,
  type QnaOrchestratorDeps,
} from './orchestrator.ts';
import { qnaOrchestratorSpec } from './orchestrator-spec.ts';

export interface PlannerQnaRuntimeDeps {
  resolveModel: () => MastraModelConfig;
  /** Built find-similar tool (factory needs provider + databaseUrl). */
  findSimilarTasksTool: AgentTool;
  /** Test seam forwarded to the orchestrator streamer. */
  streamAgent?: QnaOrchestratorDeps['streamAgent'];
}

export interface PlannerQnaRuntime {
  runStream: (
    runInput: { userText: string; taskId: string | null },
    ctx: RunCtx,
  ) => Promise<ChatStreamRun>;
}

export function buildPlannerQnaRuntime(deps: PlannerQnaRuntimeDeps): PlannerQnaRuntime {
  const taskQuery = makeQnaTaskQueryAgent({
    resolveModel: deps.resolveModel,
    findSimilarTasksTool: deps.findSimilarTasksTool,
  });
  const taskDetail = makeQnaTaskDetailAgent({ resolveModel: deps.resolveModel });
  const teamInfo = makeQnaTeamInfoAgent({ resolveModel: deps.resolveModel });
  const generalAnswer = makeQnaGeneralAnswerAgent({ resolveModel: deps.resolveModel });

  const orchestratorDeps: QnaOrchestratorDeps = {
    taskQuery,
    taskDetail,
    teamInfo,
    generalAnswer,
    resolveModel: deps.resolveModel,
    streamAgent: deps.streamAgent,
  };

  const orchestrator = makeQnaOrchestrator(orchestratorDeps);
  SpecializedAgentRegistry.register(orchestrator);
  OrchestrationRegistry.register(qnaOrchestratorSpec);

  const runStream = makeQnaChatStreamer(orchestratorDeps);
  return { runStream };
}
