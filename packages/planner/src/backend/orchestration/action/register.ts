import type { MastraModelConfig } from '@mastra/core/llm';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { type ChatStreamRun, OrchestrationRegistry, type RunCtx } from '@seta/shared-orchestration';
import {
  makeActionComment,
  makeActionSimilarTasks,
  makeActionTaskAssign,
  makeActionTaskCreate,
  makeActionTaskLink,
  makeActionTaskMerge,
  makeActionTaskRead,
  makeActionTaskUpdate,
} from './adapters.ts';
import {
  type ActionResumeCtx,
  makeActionAgent,
  makeActionResumer,
  makeActionStreamer,
} from './orchestrator.ts';
import { actionOrchestratorSpec } from './orchestrator-spec.ts';
import type { ActionPorts } from './ports.ts';
import type { ActionResume } from './schemas.ts';

export interface PlannerActionRuntime {
  runStream: (
    runInput: { userText: string; taskId: string | null },
    ctx: RunCtx,
  ) => Promise<ChatStreamRun>;
  runResume: (resume: ActionResume, ctx: ActionResumeCtx) => Promise<ChatStreamRun>;
}

export interface PlannerActionRuntimeDeps {
  resolveModel: () => MastraModelConfig;
  mastraStorage: MastraCompositeStore;
  /** Used only by planner_createTask's duplicate check, and only inside
   *  execute() — never read at composition time. */
  embeddingProvider: EmbeddingProvider;
  /** Optional to match ComposeDeps, which leaves it unset in the entrypoints that
   *  never reach a vector search. A missing value fails only a create preview. */
  databaseUrl?: string;
  /** Overridable for tests; production uses the real domain adapters. */
  ports?: ActionPorts;
}

/** Registers the A2 agent + its single-step orchestration and returns the chat
 *  entrypoints. The caller (apps/server) freezes the registries afterwards. */
export function buildPlannerActionRuntime(deps: PlannerActionRuntimeDeps): PlannerActionRuntime {
  const ports: ActionPorts = deps.ports ?? {
    taskRead: makeActionTaskRead(),
    taskUpdate: makeActionTaskUpdate(),
    taskLink: makeActionTaskLink(),
    taskMerge: makeActionTaskMerge(),
    taskAssign: makeActionTaskAssign(),
    taskCreate: makeActionTaskCreate(),
    comment: makeActionComment(),
    // The adapter closes over getters, so both deps are read lazily inside
    // search() — a getter that throws stays harmless until a create is actually
    // previewed.
    similarTasks: makeActionSimilarTasks({
      get provider() {
        return deps.embeddingProvider;
      },
      get databaseUrl() {
        return deps.databaseUrl;
      },
    }),
  };
  const agentDeps = {
    ports,
    resolveModel: deps.resolveModel,
    mastraStorage: deps.mastraStorage,
  };

  SpecializedAgentRegistry.register(makeActionAgent(agentDeps));
  OrchestrationRegistry.register(actionOrchestratorSpec);

  return {
    runStream: makeActionStreamer(agentDeps),
    runResume: makeActionResumer(agentDeps),
  };
}
