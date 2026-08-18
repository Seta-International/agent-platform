import type { MastraModelConfig } from '@mastra/core/llm';
import type { MastraCompositeStore } from '@mastra/core/storage';
import type { AgentTool } from '@seta/agent-sdk';
// REFERENCE_TIME lives in the golden constants (a zero-dependency leaf module) so the
// fixture data and the eval-executed agent share one frozen anchor. Importing it here
// pulls only a Date constant — none of the heavier fixture graph (tasks/events/seed).
import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { ACTION_REFERENCE_TIME } from '../../../tests/fixtures/golden/action/constants.ts';
import { REFERENCE_TIME } from '../../../tests/fixtures/golden/constants.ts';
import { plannerFindSimilarTasksTool } from '../agent-tools/find-similar-tasks.ts';
import { makeActionResumer, makeActionStreamer } from './action/orchestrator.ts';
import type { PreviewPort } from './action/ports.ts';
import { makeActionPorts } from './action/register.ts';
import {
  makeQueryGeneralAnswerAgent,
  makeQueryTaskDetailAgent,
  makeQueryTaskSearchAgent,
  makeQueryTeamInfoAgent,
} from './agents/index.ts';
import { makeQueryChatStreamer, type QueryOrchestratorDeps } from './orchestrator.ts';
import type { PlannerQueryRuntime } from './register.ts';
import type { OnToolActivity, ToolActivity } from './tool-activity.ts';

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
  /** When set, both trajectory tiers (routing + sub-agent tools) are recorded here. */
  collector?: ToolActivityCollector;
}

/** Structural sink for captured tool activity — satisfied by the golden fixture's
 *  `TrajectoryCollector` without a cross-boundary import into production code. */
export interface ToolActivityCollector {
  record: (agentId: string, calls: ToolActivity[]) => void;
}

function buildRuntime(
  resolveModel: () => MastraModelConfig,
  findSimilarTasksTool: AgentTool,
  streamAgent?: QueryOrchestratorDeps['streamAgent'],
  collector?: ToolActivityCollector,
): PlannerQueryRuntime {
  const sink = (agentId: string): OnToolActivity | undefined =>
    collector ? (calls) => collector.record(agentId, calls) : undefined;

  const taskSearch = makeQueryTaskSearchAgent({
    resolveModel,
    mastraStorage: stubStorage,
    findSimilarTasksTool,
    now: () => REFERENCE_TIME,
    onToolActivity: sink('planner.query.taskSearch'),
  });
  const taskDetail = makeQueryTaskDetailAgent({
    resolveModel,
    mastraStorage: stubStorage,
    onToolActivity: sink('planner.query.taskDetail'),
  });
  const teamInfo = makeQueryTeamInfoAgent({
    resolveModel,
    mastraStorage: stubStorage,
    onToolActivity: sink('planner.query.teamInfo'),
  });
  const generalAnswer = makeQueryGeneralAnswerAgent({
    resolveModel,
    mastraStorage: stubStorage,
    onToolActivity: sink('planner.query.generalAnswer'),
  });

  const deps: QueryOrchestratorDeps = {
    taskQuery: taskSearch,
    taskDetail,
    teamInfo,
    generalAnswer,
    resolveModel,
    mastraStorage: stubStorage,
    streamAgent,
    onToolActivity: sink('planner.query.orchestrator'),
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

    buildQualityRuntime: (opts2) =>
      buildRuntime(opts2.resolveModel, findSimilar, undefined, opts.collector),
  };
}

export interface PlannerActionEvalTarget {
  runStream: ReturnType<typeof makeActionStreamer>;
  runResume: ReturnType<typeof makeActionResumer>;
}

export interface BuildPlannerActionEvalTargetOpts {
  /** The in-process stand-in for the `agent`-schema preview reader (design D1). */
  previewPort: PreviewPort;
  resolveModel: () => MastraModelConfig;
  /** Needed only by `planner_createTask`'s duplicate check; read lazily inside
   *  `execute()`, so a lane with no create case may omit it. */
  databaseUrl?: string;
  /** The suspend snapshot must survive BETWEEN runStream and runResume, so this
   *  must be ONE instance shared by both calls. An `InMemoryStore` suffices —
   *  both calls happen in one process. */
  mastraStorage: MastraCompositeStore;
  now?: () => Date;
}

/**
 * A2, composed for the golden lane.
 *
 * Deliberately NOT `buildPlannerActionRuntime`: that registers the specialist and
 * the orchestration spec in module-global registries (`action/register.ts:96-97`),
 * which a per-case build would do repeatedly and which apps/server freezes. Here
 * the same three factories are composed directly and nothing global is touched.
 */
export function buildPlannerActionEvalTarget(
  opts: BuildPlannerActionEvalTargetOpts,
): PlannerActionEvalTarget {
  const deps = {
    ports: makeActionPorts({
      previewPort: opts.previewPort,
      embeddingProvider: resolveEmbeddingProvider(),
      databaseUrl: opts.databaseUrl,
    }),
    resolveModel: opts.resolveModel,
    mastraStorage: opts.mastraStorage,
    now: opts.now ?? (() => ACTION_REFERENCE_TIME),
  };
  return { runStream: makeActionStreamer(deps), runResume: makeActionResumer(deps) };
}
