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
import type { ActionPorts, PreviewPort } from './ports.ts';
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
  /** A2's read access to its own open previews. Injected because the approval
   *  rows live in the `agent` schema, which planner may not read (FUT-840). */
  previewPort: PreviewPort;
  /** Overridable for tests; production uses the real domain adapters. */
  ports?: ActionPorts;
}

/**
 * A2's production port set: every real domain adapter, plus the injected
 * `preview` (whose SQL lives in the agent tier).
 *
 * Named rather than inlined into `buildPlannerActionRuntime` because apps/server
 * — the one layer that can supply a real `PreviewPort` — also needs to compose
 * these ports outside a Mastra runtime, to exercise the tools without a model.
 */
export function makeActionPorts(deps: {
  previewPort: PreviewPort;
  embeddingProvider: EmbeddingProvider;
  databaseUrl?: string;
}): ActionPorts {
  return {
    taskRead: makeActionTaskRead(),
    taskUpdate: makeActionTaskUpdate(),
    taskLink: makeActionTaskLink(),
    taskMerge: makeActionTaskMerge(),
    taskAssign: makeActionTaskAssign(),
    taskCreate: makeActionTaskCreate(),
    comment: makeActionComment(),
    preview: deps.previewPort,
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
}

/** Registers the A2 agent + its single-step orchestration and returns the chat
 *  entrypoints. The caller (apps/server) freezes the registries afterwards. */
export function buildPlannerActionRuntime(deps: PlannerActionRuntimeDeps): PlannerActionRuntime {
  const ports: ActionPorts = deps.ports ?? makeActionPorts(deps);
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
