import type { MastraModelConfig } from '@mastra/core/llm';
import type { MastraCompositeStore } from '@mastra/core/storage';
import type { AgentTool } from '@seta/agent-sdk';
// REFERENCE_TIME lives in the golden constants (a zero-dependency leaf module) so the
// fixture data and the eval-executed agent share one frozen anchor. Importing it here
// pulls only a Date constant — none of the heavier fixture graph (tasks/events/seed).
import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { REFERENCE_TIME } from '../../../tests/fixtures/golden/constants.ts';
import { plannerFindSimilarTasksTool } from '../agent-tools/find-similar-tasks.ts';
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

/** Options for the E2E lane. When `databaseUrl` is set, the real
 *  `planner_findSimilarTasks` tool runs against seeded pgvector embeddings
 *  instead of the stub; default (no opts) keeps the existing stubbed behavior. */
export interface BuildPlannerQueryEvalTargetOpts {
  databaseUrl?: string;
}

function buildRuntime(
  resolveModel: () => MastraModelConfig,
  findSimilarTasksTool: AgentTool,
  streamAgent?: QueryOrchestratorDeps['streamAgent'],
): PlannerQueryRuntime {
  const taskSearch = makeQueryTaskSearchAgent({
    resolveModel,
    mastraStorage: stubStorage,
    findSimilarTasksTool,
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

export function buildPlannerQueryEvalTarget(
  opts: BuildPlannerQueryEvalTargetOpts = {},
): PlannerQueryEvalTarget {
  const findSimilar = opts.databaseUrl
    ? (plannerFindSimilarTasksTool({
        provider: resolveEmbeddingProvider(),
        databaseUrl: opts.databaseUrl,
        now: () => REFERENCE_TIME,
      }) as unknown as AgentTool)
    : stubFindSimilar;

  return {
    buildDeterministicRuntime: () =>
      buildRuntime(
        () => ({}) as never,
        findSimilar,
        () => ({
          text: Promise.resolve('Deterministic eval response.'),
        }),
      ),

    buildQualityRuntime: (opts2) => buildRuntime(opts2.resolveModel, findSimilar),
  };
}
