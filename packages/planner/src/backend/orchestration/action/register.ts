import type { MastraModelConfig } from '@mastra/core/llm';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { type ChatStreamRun, OrchestrationRegistry, type RunCtx } from '@seta/shared-orchestration';
import { makeActionTaskRead, makeActionTaskUpdate } from './adapters.ts';
import {
  type ActionResumeCtx,
  makeActionAgent,
  makeActionResumer,
  makeActionStreamer,
} from './orchestrator.ts';
import { actionOrchestratorSpec } from './orchestrator-spec.ts';
import type { ActionPorts } from './ports.ts';
import type { UpdateTaskResume } from './schemas.ts';

export interface PlannerActionRuntime {
  runStream: (
    runInput: { userText: string; taskId: string | null },
    ctx: RunCtx,
  ) => Promise<ChatStreamRun>;
  runResume: (resume: UpdateTaskResume, ctx: ActionResumeCtx) => Promise<ChatStreamRun>;
}

export interface PlannerActionRuntimeDeps {
  resolveModel: () => MastraModelConfig;
  mastraStorage: MastraCompositeStore;
  /** Overridable for tests; production uses the real domain adapters. */
  ports?: ActionPorts;
}

/** Registers the A2 agent + its single-step orchestration and returns the chat
 *  entrypoints. The caller (apps/server) freezes the registries afterwards. */
export function buildPlannerActionRuntime(deps: PlannerActionRuntimeDeps): PlannerActionRuntime {
  const ports: ActionPorts = deps.ports ?? {
    taskRead: makeActionTaskRead(),
    taskUpdate: makeActionTaskUpdate(),
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
