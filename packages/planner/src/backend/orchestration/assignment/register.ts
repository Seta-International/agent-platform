import type { MastraModelConfig } from '@mastra/core/llm';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
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
import { defaultAssignBySkillDeps } from '../../workflows/assign-by-skill/deps.ts';
import { computeAssigneeSuggestions } from '../../workflows/assign-by-skill/workflow.ts';
import { makeGroupMemberSkills } from './adapters.ts';
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
  TaskAssigneesPort,
  TaskReaderPort,
  TaskSearchPort,
  UserProfilePort,
} from './ports.ts';
import type { SuggestAssignees } from './propose-assignment.tool.ts';

export interface AssignmentPorts {
  taskReader: TaskReaderPort;
  taskSearch: TaskSearchPort;
  skillSearch: SkillSearchPort;
  availability: AvailabilityPort;
  userProfileLookup: UserProfilePort;
  assign: AssignPort;
  taskAssignees: TaskAssigneesPort;
}

export interface AssignmentOrchestrationRuntime {
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
export function __setAssignmentRunIdForTests(fn: () => string): void {
  newRunId = fn;
}

/**
 * Registers the orchestrator agent + its single-step orchestration into the
 * kernel registries, and returns the worker task list + inline runner. The
 * orchestrator owns the flow, delegating to the task-analysis and recommendation
 * sub-agents through its tools. The caller (apps/server) freezes the registries
 * after calling this.
 */
export function buildAssignmentOrchestrationRuntime(deps: {
  ports: AssignmentPorts;
  resolveModel: () => MastraModelConfig;
  repo: RunStateRepository;
  /**
   * Store the per-turn orchestrator Mastra wraps so its native-suspend snapshot
   * persists (Task 7's resume reloads it). Injected at the composition root so
   * the SAME physical store instance is shared with the agent engine's Mastra —
   * cross-Mastra-instance resume requires both point at one store.
   */
  mastraStorage: MastraCompositeStore;
}): AssignmentOrchestrationRuntime {
  const { ports, resolveModel, repo, mastraStorage } = deps;

  // Sub-agents are invoked through the orchestrator's tools (direct .run calls),
  // not via the registry, so only the orchestrator agent is registered.
  const taskAnalyzer = makeTaskAnalyzerAgent({
    taskReader: ports.taskReader,
    taskSearch: ports.taskSearch,
    resolveModel,
  });
  const skillMatcher = makeSkillMatcherAgent({
    skillSearch: ports.skillSearch,
    resolveModel,
    groupMembers: makeGroupMemberSkills(),
  });
  const avaiChecker = makeAvaiCheckerAgent({ availability: ports.availability });
  const recommender = makeRecommenderAgent();
  const generalAnswer = makeGeneralAnswerAgent({ resolveModel });
  // Single-task recommend shares the inline suggestions engine: resolve the
  // actor's session (for its role summary → RBAC), then run computeAssigneeSuggestions.
  const suggest: SuggestAssignees = async ({ taskId, tenantId, actorUserId }) => {
    const session = await buildActorSession({ user_id: actorUserId });
    return computeAssigneeSuggestions(
      { taskId, session: { tenantId, userId: actorUserId, roleSummary: session.role_summary } },
      defaultAssignBySkillDeps(),
    );
  };
  const orchestratorDeps = {
    taskAnalyzer,
    skillMatcher,
    avaiChecker,
    recommender,
    generalAnswer,
    userProfileLookup: ports.userProfileLookup,
    assign: ports.assign,
    suggest,
    taskAssignees: ports.taskAssignees,
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

  const runInline: AssignmentOrchestrationRuntime['runInline'] = (runInput, ctx) =>
    runOrchestrationInline('planner.assignment-orchestrator', runInput, ctx, {
      ...runnerDeps,
      newRunId,
    });

  const streamChat = makeChatOrchestrationStreamer(orchestratorDeps);
  const resumeChat = makeChatOrchestrationResumer(orchestratorDeps);

  return { taskList, runInline, runStream: streamChat, runResume: resumeChat, repo };
}

export type { AddJob };
