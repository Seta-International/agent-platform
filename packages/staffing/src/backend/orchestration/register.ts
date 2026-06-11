import type { MastraModelConfig } from '@mastra/core/llm';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import {
  type AddJob,
  type ChatStreamRun,
  makeOrchestrationTaskList,
  type OrchestrationEvent,
  OrchestrationRegistry,
  type RunCtx,
  type RunStateRepository,
  runOrchestrationInline,
} from '@seta/shared-orchestration';
import {
  makeAvaiCheckerAgent,
  makeGeneralAnswerAgent,
  makeRecommenderAgent,
  makeSkillMatcherAgent,
  makeTaskAnalyzerAgent,
} from './agents/index.ts';
import {
  makeChatOrchestrationResumer,
  makeChatOrchestrationStreamer,
  makeOrchestratorAgent,
  type ResumeDecision,
} from './orchestrator.ts';
import { orchestratorSpec } from './orchestrator-spec.ts';
import type {
  AssignPort,
  AvailabilityPort,
  SkillSearchPort,
  TaskReaderPort,
  TaskSearchPort,
  UserProfilePort,
} from './ports.ts';

export interface StaffingPorts {
  taskReader: TaskReaderPort;
  taskSearch: TaskSearchPort;
  skillSearch: SkillSearchPort;
  availability: AvailabilityPort;
  userProfileLookup: UserProfilePort;
  assign: AssignPort;
}

export interface StaffingOrchestrationRuntime {
  taskList: ReturnType<typeof makeOrchestrationTaskList>;
  runInline: (
    runInput: { userText: string; taskId: string | null },
    ctx: RunCtx,
  ) => AsyncIterable<OrchestrationEvent>;
  runStream: (
    runInput: { userText: string; taskId: string | null },
    ctx: RunCtx,
  ) => Promise<ChatStreamRun>;
  /** Resumes a suspended native-suspend orchestrator run (the chat-HITL approval
   *  continuation). Injected by the app as the agent route's resumeOrchestration. */
  runResume: (
    resume: ResumeDecision,
    ctx: RunCtx & { mastraRunId: string; toolCallId?: string },
  ) => Promise<ChatStreamRun>;
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
  /**
   * Store the per-turn orchestrator Mastra wraps so its native-suspend snapshot
   * persists (Task 7's resume reloads it). Injected at the composition root —
   * staffing does NOT own storage (and cannot import @mastra/pg). The same
   * instance is shared with the agent engine so cross-Mastra resume works.
   */
  mastraStorage: MastraCompositeStore;
}): StaffingOrchestrationRuntime {
  const { ports, resolveModel, repo, mastraStorage } = deps;

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
  const generalAnswer = makeGeneralAnswerAgent({ resolveModel });
  const orchestratorDeps = {
    taskAnalyzer,
    skillMatcher,
    avaiChecker,
    recommender,
    generalAnswer,
    userProfileLookup: ports.userProfileLookup,
    assign: ports.assign,
    resolveModel,
    mastraStorage,
  };
  const orchestrator = makeOrchestratorAgent(orchestratorDeps);

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

  const streamChat = makeChatOrchestrationStreamer(orchestratorDeps);
  const resumeChat = makeChatOrchestrationResumer(orchestratorDeps);

  return { taskList, runInline, runStream: streamChat, runResume: resumeChat, repo };
}

export type { AddJob };
