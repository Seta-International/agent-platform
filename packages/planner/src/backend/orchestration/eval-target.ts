import type { MastraModelConfig } from '@mastra/core/llm';
import type { MastraCompositeStore } from '@mastra/core/storage';
import type { AgentTool } from '@seta/agent-sdk';
// REFERENCE_TIME lives in the golden constants (a zero-dependency leaf module) so the
// fixture data and the eval-executed agent share one frozen anchor. Importing it here
// pulls only a Date constant — none of the heavier fixture graph (tasks/events/seed).
import { REFERENCE_TIME } from '../../../tests/fixtures/golden/constants.ts';
import {
  makeQueryGeneralAnswerAgent,
  makeQueryTaskDetailAgent,
  makeQueryTaskSearchAgent,
  makeQueryTeamInfoAgent,
} from './agents/index.ts';
import { makeQueryChatStreamer, type QueryOrchestratorDeps } from './orchestrator.ts';
import type { PlannerQueryRuntime } from './register.ts';

const stubFindSimilar = { id: 'planner_findSimilarTasks' } as unknown as AgentTool;
const stubStorage = {} as unknown as MastraCompositeStore;

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
    mastraStorage: stubStorage,
    findSimilarTasksTool: stubFindSimilar,
    now: () => REFERENCE_TIME,
  });
  const taskDetail = makeQueryTaskDetailAgent({ resolveModel, mastraStorage: stubStorage });
  const teamInfo = makeQueryTeamInfoAgent({ resolveModel, mastraStorage: stubStorage });
  const generalAnswer = makeQueryGeneralAnswerAgent({ resolveModel, mastraStorage: stubStorage });

  const deps: QueryOrchestratorDeps = {
    taskQuery: taskSearch,
    taskDetail,
    teamInfo,
    generalAnswer,
    resolveModel,
    mastraStorage: stubStorage,
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
