import type { MastraModelConfig } from '@mastra/core/llm';
import type { AgentTool } from '@seta/agent-sdk';
import {
  makeQueryGeneralAnswerAgent,
  makeQueryTaskDetailAgent,
  makeQueryTaskSearchAgent,
  makeQueryTeamInfoAgent,
} from './agents/index.ts';
import { makeQueryChatStreamer, type QueryOrchestratorDeps } from './orchestrator.ts';
import type { PlannerQueryRuntime } from './register.ts';

const stubFindSimilar = { id: 'planner_findSimilarTasks' } as unknown as AgentTool;

export interface PlannerQueryEvalTarget {
  buildDeterministicRuntime: () => PlannerQueryRuntime;
  buildQualityRuntime: (opts: { resolveModel: () => MastraModelConfig }) => PlannerQueryRuntime;
}

function buildRuntime(
  resolveModel: () => MastraModelConfig,
  streamAgent?: QueryOrchestratorDeps['streamAgent'],
): PlannerQueryRuntime {
  const taskSearch = makeQueryTaskSearchAgent({
    resolveModel,
    findSimilarTasksTool: stubFindSimilar,
  });
  const taskDetail = makeQueryTaskDetailAgent({ resolveModel });
  const teamInfo = makeQueryTeamInfoAgent({ resolveModel });
  const generalAnswer = makeQueryGeneralAnswerAgent({ resolveModel });

  const deps: QueryOrchestratorDeps = {
    taskQuery: taskSearch,
    taskDetail,
    teamInfo,
    generalAnswer,
    resolveModel,
    streamAgent,
  };

  const runStream = makeQueryChatStreamer(deps);
  return { runStream };
}

export function buildPlannerQueryEvalTarget(): PlannerQueryEvalTarget {
  return {
    buildDeterministicRuntime: () =>
      buildRuntime(
        () => ({}) as never,
        () => ({ text: Promise.resolve('Deterministic eval response.') }),
      ),

    buildQualityRuntime: (opts) => buildRuntime(opts.resolveModel),
  };
}
