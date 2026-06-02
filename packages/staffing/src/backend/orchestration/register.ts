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
import type { LanguageModel } from 'ai';
import {
  makeAnalyzerAgent,
  makeAvaiCheckerAgent,
  makeRecommenderAgent,
  makeSkillMatcherAgent,
} from './agents/index.ts';
import { assigneeRecommendationSpec } from './assignee-recommendation.ts';
import type { AvailabilityPort, SkillSearchPort, TaskReaderPort } from './ports.ts';

export interface StaffingPorts {
  taskReader: TaskReaderPort;
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
 * Registers the four staffing agents + the assigneeRecommendation orchestration
 * into the kernel registries, and returns the worker task list + inline runner.
 * The caller (apps/server) freezes the registries after calling this.
 */
export function buildStaffingOrchestrationRuntime(deps: {
  ports: StaffingPorts;
  resolveModel: () => LanguageModel;
  repo: RunStateRepository;
}): StaffingOrchestrationRuntime {
  const { ports, resolveModel, repo } = deps;

  SpecializedAgentRegistry.register(
    makeAnalyzerAgent({ taskReader: ports.taskReader, resolveModel }),
  );
  SpecializedAgentRegistry.register(
    makeSkillMatcherAgent({ skillSearch: ports.skillSearch, resolveModel }),
  );
  SpecializedAgentRegistry.register(
    makeAvaiCheckerAgent({ availability: ports.availability, resolveModel }),
  );
  SpecializedAgentRegistry.register(makeRecommenderAgent());

  OrchestrationRegistry.register(assigneeRecommendationSpec);

  const runnerDeps = {
    repo,
    getOrchestration: (id: string) => OrchestrationRegistry.get(id),
    getAgent: (id: string) => SpecializedAgentRegistry.get(id),
  };

  const taskList = makeOrchestrationTaskList(runnerDeps);

  const runInline: StaffingOrchestrationRuntime['runInline'] = (runInput, ctx) =>
    runOrchestrationInline('staffing.assigneeRecommendation', runInput, ctx, {
      ...runnerDeps,
      newRunId,
    });

  return { taskList, runInline, repo };
}

export type { AddJob };
