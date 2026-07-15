import type { MastraModelConfig } from '@mastra/core/llm';
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
  buildPlannerQnaRuntime,
  buildWeeklyPlanRuntime,
  type PlannerQnaRuntime,
  type WeeklyPlanRuntime,
} from '@seta/planner/orchestration';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { OrchestrationRegistry } from '@seta/shared-orchestration';

export interface ComposeDeps {
  /** Shared model resolver for every orchestration runtime composed here. */
  resolveModel: () => MastraModelConfig;
  /**
   * Embedding provider for the planner QnA runtime's find-similar-tasks tool.
   * Only read lazily inside the tool's `execute()` — never at composition
   * time — so a stub is safe wherever this runs without a live provider.
   */
  embeddingProvider: EmbeddingProvider;
  /**
   * Forwarded to the find-similar-tasks tool as a fallback pgVector source;
   * like `embeddingProvider`, only read lazily at execute time.
   */
  databaseUrl?: string;
}

export interface ComposedOrchestrationRuntimes {
  plannerQnaOrchestration: PlannerQnaRuntime;
  weeklyPlanOrchestration: WeeklyPlanRuntime;
}

/**
 * Composition root for the process-global agent registries.
 *
 * Builds the planner QnA and weekly-plan orchestration runtimes — the two
 * orchestration runtimes composable without a live DB connection — and
 * freezes SpecializedAgentRegistry, OrchestrationRegistry, and AgentRegistry
 * once every module's contribution has landed. Registers + freezes only;
 * never binds HTTP listeners or worker handles.
 *
 * Deliberately excludes:
 *  - the ContributionRegistry (`reg`) construction and `register*Contributions`
 *    calls — `reg` feeds `runMigrations`/`registerAgent`/`buildRuntime`/
 *    `buildServerApp` in apps/server/src/index.ts, all DB/HTTP-bound, so it
 *    stays there (see `// MODULE_REGISTRATIONS_END` in index.ts).
 *  - the assignment orchestration runtime — its ports (task/skill search,
 *    availability, etc.) are wired to live DB adapters and must not leak into
 *    this server-free composition. index.ts builds it and registers it into
 *    SpecializedAgentRegistry *before* calling this function, so its entry is
 *    present by the time we freeze below.
 */
export function composeRegistries(deps: ComposeDeps): ComposedOrchestrationRuntimes {
  const plannerFindSimilar = plannerFindSimilarTasksTool({
    provider: deps.embeddingProvider,
    databaseUrl: deps.databaseUrl,
  });
  const plannerQnaOrchestration = buildPlannerQnaRuntime({
    resolveModel: deps.resolveModel,
    findSimilarTasksTool: plannerFindSimilar,
  });

  const weeklyPlanOrchestration = buildWeeklyPlanRuntime({
    resolveModel: deps.resolveModel,
  });

  SpecializedAgentRegistry.freeze();
  OrchestrationRegistry.freeze();
  AgentRegistry.freeze();

  return { plannerQnaOrchestration, weeklyPlanOrchestration };
}
