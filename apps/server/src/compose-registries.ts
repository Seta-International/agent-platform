import type { MastraModelConfig } from '@mastra/core/llm';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { AgentRegistry, SpecializedAgentRegistry } from '@seta/agent-sdk';
// Side-effect import: every module's `agent-tools/register.ts` registers its
// specialists / cross-module read tools / workflows into AgentRegistry as a
// module-load side effect, wired together by @seta/agent's (private)
// init-registry.ts. Importing the public `/register` subpath here — rather
// than reaching into that private file — guarantees AgentRegistry is fully
// populated before the freeze() below, whether this module is loaded via
// apps/server/src/index.ts (which also imports it, for registerAgent) or
// standalone, as the registry-integrity test does.
import '@seta/agent/register';
import { plannerFindSimilarTasksTool } from '@seta/planner/agent-tools';
import {
  type AssignmentOrchestrationRuntime,
  type AssignmentPorts,
  buildAssignmentOrchestrationRuntime,
  buildPlannerActionRuntime,
  buildPlannerQueryRuntime,
  buildWeeklyPlanRuntime,
  type PlannerActionRuntime,
  type PlannerQueryRuntime,
  type WeeklyPlanRuntime,
} from '@seta/planner/orchestration';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { OrchestrationRegistry, type RunStateRepository } from '@seta/shared-orchestration';

export interface ComposeDeps {
  /** Shared model resolver for every orchestration runtime composed here. */
  resolveModel: () => MastraModelConfig;
  /**
   * Embedding provider for the planner Query runtime's find-similar-tasks tool.
   * Only read lazily inside the tool's `execute()` — never at composition
   * time — so a stub is safe wherever this runs without a live provider.
   */
  embeddingProvider: EmbeddingProvider;
  /**
   * Forwarded to the find-similar-tasks tool as a fallback pgVector source;
   * like `embeddingProvider`, only read lazily at execute time.
   */
  databaseUrl?: string;
  /** Assignment orchestrator's ports (task/skill search, availability, etc.):
   *  real DB adapters from apps/server/src/index.ts, fake/throwing stubs from
   *  tests/helpers/compose.ts's testComposeDeps(). */
  assignmentPorts: AssignmentPorts;
  /** Run-state persistence for the assignment orchestrator. */
  assignmentRepo: RunStateRepository;
  /** Mastra store the assignment orchestrator's per-turn Mastra wraps. Must be
   *  the SAME physical store as the agent engine's Mastra in production (see
   *  index.ts) so cross-Mastra-instance native-suspend resume works. */
  mastraStorage: MastraCompositeStore;
}

export interface ComposedOrchestrationRuntimes {
  plannerQueryOrchestration: PlannerQueryRuntime;
  weeklyPlanOrchestration: WeeklyPlanRuntime;
  assignmentOrchestration: AssignmentOrchestrationRuntime;
  /** A2: the mutate intent. Reachable from chat once FUT-814 routes to it. */
  actionOrchestration: PlannerActionRuntime;
}

/**
 * Composition root for the process-global agent registries.
 *
 * Builds the planner Query, weekly-plan, and assignment orchestration runtimes
 * and freezes SpecializedAgentRegistry, OrchestrationRegistry, and
 * AgentRegistry once every module's contribution has landed. Registers +
 * freezes only; never binds HTTP listeners or worker handles.
 *
 * The assignment orchestrator's DB-bound ports (task/skill search,
 * availability, etc.) and its run-state repo/Mastra store are injected via
 * `ComposeDeps` rather than constructed here, so this composition root stays
 * free of live DB connections: apps/server/src/index.ts wires real adapters,
 * tests/helpers/compose.ts's testComposeDeps() wires fakes. This is what lets
 * the eval-coverage and registry-integrity gates snapshot
 * `planner.assignment-orchestrator` alongside every other specialist.
 *
 * Deliberately excludes:
 *  - the ContributionRegistry (`reg`) construction and `register*Contributions`
 *    calls — `reg` feeds `runMigrations`/`registerAgent`/`buildRuntime`/
 *    `buildServerApp` in apps/server/src/index.ts, all DB/HTTP-bound, so it
 *    stays there (see `// MODULE_REGISTRATIONS_END` in index.ts).
 */
export function composeRegistries(deps: ComposeDeps): ComposedOrchestrationRuntimes {
  const plannerFindSimilar = plannerFindSimilarTasksTool({
    provider: deps.embeddingProvider,
    databaseUrl: deps.databaseUrl,
  });
  const plannerQueryOrchestration = buildPlannerQueryRuntime({
    resolveModel: deps.resolveModel,
    mastraStorage: deps.mastraStorage,
    findSimilarTasksTool: plannerFindSimilar,
  });

  const weeklyPlanOrchestration = buildWeeklyPlanRuntime({
    resolveModel: deps.resolveModel,
  });

  const assignmentOrchestration = buildAssignmentOrchestrationRuntime({
    ports: deps.assignmentPorts,
    resolveModel: deps.resolveModel,
    repo: deps.assignmentRepo,
    mastraStorage: deps.mastraStorage,
  });

  const actionOrchestration = buildPlannerActionRuntime({
    resolveModel: deps.resolveModel,
    mastraStorage: deps.mastraStorage,
    // planner_createTask's duplicate check. Both are read lazily, inside the
    // tool, exactly as plannerFindSimilarTasksTool reads them above.
    embeddingProvider: deps.embeddingProvider,
    get databaseUrl(): string | undefined {
      return deps.databaseUrl;
    },
  });

  SpecializedAgentRegistry.freeze();
  OrchestrationRegistry.freeze();
  AgentRegistry.freeze();

  return {
    plannerQueryOrchestration,
    weeklyPlanOrchestration,
    assignmentOrchestration,
    actionOrchestration,
  };
}
