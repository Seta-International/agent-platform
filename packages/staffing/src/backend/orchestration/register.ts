import type { MastraModelConfig } from '@mastra/core/llm';
import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import {
  type AddJob,
  makeOrchestrationTaskList,
  type OrchestrationEvent,
  OrchestrationRegistry,
  type RunCtx,
  type RunStateRepository,
  runOrchestrationInline,
} from '@seta/shared-orchestration';
import {
  makeAvaiCheckerAgent,
  makeRecommenderAgent,
  makeSkillMatcherAgent,
  makeTaskAnalyzerAgent,
} from './agents/index.ts';
import { makeOrchestratorAgent } from './orchestrator.ts';
import { orchestratorSpec } from './orchestrator-spec.ts';
import type { AvailabilityPort, SkillSearchPort, TaskReaderPort, TaskSearchPort } from './ports.ts';

export interface StaffingPorts {
  taskReader: TaskReaderPort;
  taskSearch: TaskSearchPort;
  skillSearch: SkillSearchPort;
  availability: AvailabilityPort;
}

export interface StaffingOrchestrationRuntime {
  taskList: ReturnType<typeof makeOrchestrationTaskList>;
  runInline: (
    runInput: { userText: string; taskId: string | null },
    ctx: RunCtx,
  ) => AsyncIterable<OrchestrationEvent>;
  repo: RunStateRepository;
}

let newRunId: () => string = () => crypto.randomUUID();

/** Override the run-id generator (tests). */
export function __setStaffingRunIdForTests(fn: () => string): void {
  newRunId = fn;
}

/**
 * Registers the orchestrator agent + its single-step orchestration into the
 * kernel registries, and returns the worker task list + inline runner. The
 * orchestrator owns the flow, delegating to the task-analysis and recommendation
 * sub-agents through its tools. The caller (apps/server) freezes the registries
 * after calling this.
 */
export function buildStaffingOrchestrationRuntime(deps: {
  ports: StaffingPorts;
  resolveModel: () => MastraModelConfig;
  repo: RunStateRepository;
}): StaffingOrchestrationRuntime {
  const { ports, resolveModel, repo } = deps;

  // Sub-agents are invoked through the orchestrator's tools (direct .run calls),
  // not via the registry, so only the orchestrator agent is registered.
  const taskAnalyzer = makeTaskAnalyzerAgent({
    taskReader: ports.taskReader,
    taskSearch: ports.taskSearch,
    resolveModel,
  });
  const skillMatcher = makeSkillMatcherAgent({ skillSearch: ports.skillSearch, resolveModel });
  const avaiChecker = makeAvaiCheckerAgent({ availability: ports.availability });
  const recommender = makeRecommenderAgent();
  const orchestrator = makeOrchestratorAgent({
    taskAnalyzer,
    skillMatcher,
    avaiChecker,
    recommender,
    resolveModel,
  });

  SpecializedAgentRegistry.register(orchestrator);
  OrchestrationRegistry.register(orchestratorSpec);

  const runnerDeps = {
    repo,
    getOrchestration: (id: string) => OrchestrationRegistry.get(id),
    getAgent: (id: string) => SpecializedAgentRegistry.get(id),
  };

  const taskList = makeOrchestrationTaskList(runnerDeps);

  const runInline: StaffingOrchestrationRuntime['runInline'] = (runInput, ctx) =>
    runOrchestrationInline('staffing.orchestrator', runInput, ctx, { ...runnerDeps, newRunId });

  return { taskList, runInline, repo };
}

export type { AddJob };
