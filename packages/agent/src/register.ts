import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { MastraCompositeStore } from '@mastra/core/storage';
import type { AnyWorkflow } from '@mastra/core/workflows';
import {
  AgentRegistry,
  registerPendingAssignReader,
  setBreakerConfig,
  setBreakerEventEmitter,
  setExecutionPolicy,
} from '@seta/agent-sdk';
import type { AgentSpec, ContributionRegistry } from '@seta/core';
import type { Hono } from 'hono';
import type { Pool } from 'pg';
import { buildBreakerEmitter } from './backend/breaker-emitter.ts';
import * as schema from './backend/db/schema.ts';
import { getPendingAssignRunIdForTask } from './backend/domain/get-pending-assign-run-for-task.ts';
import { agentEnv } from './backend/env.ts';
import { initAgentRegistry } from './backend/init-registry.ts';
import { agentJobs } from './backend/jobs/rate-limit-cleanup.ts';
import { buildEntitiesMemory, buildMemory } from './backend/memory.ts';
import { type ModelTier, resolveModel } from './backend/model-registry.ts';
import { validateModelEnv } from './backend/provider-config.ts';
import { registerAgentRoutes } from './backend/routes.ts';
import { buildMastraFull } from './backend/runtime.ts';
import { agentSubscribers } from './backend/subscribers/index.ts';
import { registerWorkflowInputSchema } from './backend/workflows/_infra/input-schema-registry.ts';
import { agentRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerAgentContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'agent',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle'),
    rbac: agentRbac,
    subscribers: agentSubscribers(),
    jobs: agentJobs,
    crontab: '* * * * * agent_rate_limits_cleanup',
  });
}

export type AgentHandle = {
  attach: (app: Hono) => void;
  mastra: Mastra;
};

export function buildAgentFromSpec(spec: AgentSpec, opts: { model?: unknown } = {}): Agent {
  const model =
    opts.model ??
    resolveModel(undefined, { tierHint: spec.defaultTier as ModelTier | undefined }).model;
  return new Agent({
    id: spec.id,
    name: spec.id,
    instructions: spec.instructions,
    model: model as never,
  });
}

export { createAgentMastraStorage } from './backend/runtime.ts';

export function registerAgent(deps: {
  pool: Pool;
  databaseUrl: string;
  reg: ContributionRegistry;
  /**
   * Pre-built store, forwarded to buildMastraFull so the engine Mastra reuses
   * the same instance the staffing orchestrator's per-turn Mastra wraps —
   * cross-instance native-suspend resume requires ONE shared store. Built once
   * at the composition root via createAgentMastraStorage.
   */
  mastraStorage?: MastraCompositeStore;
  log?: {
    error: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
  /**
   * The chat runtime: every chat turn streams through this inline staffing
   * orchestration. Injected by the server entry-point (the only layer that can
   * bind staffing adapters to the engine). See AgentRouteDeps.chatOrchestration.
   */
  chatOrchestration: (
    runInput: { userText: string; taskId: string | null },
    ctx: import('@seta/shared-orchestration').RunCtx,
  ) => Promise<import('@seta/shared-orchestration').ChatStreamRun>;
  /**
   * Resume runtime for native-suspend agentic chat-HITL runs. Injected by the
   * server entry-point as the staffing runtime's `runResume`. See
   * AgentRouteDeps.resumeOrchestration.
   */
  resumeOrchestration?: import('./backend/routes.ts').AgentRouteDeps['resumeOrchestration'];
  /**
   * Chat-attachment consume/mark functions, injected by the server entry-point
   * from @seta/knowledge (the only layer that can import a feature module into
   * the engine). See AgentRouteDeps.consumeThreadAttachments / markAttachmentsConsumed.
   */
  consumeThreadAttachments?: import('./backend/routes.ts').AgentRouteDeps['consumeThreadAttachments'];
  markAttachmentsConsumed?: import('./backend/routes.ts').AgentRouteDeps['markAttachmentsConsumed'];
  markAttachmentsFailed?: import('./backend/routes.ts').AgentRouteDeps['markAttachmentsFailed'];
}): AgentHandle {
  validateModelEnv(process.env);
  setExecutionPolicy({
    readMs: agentEnv.AGENT_TOOL_TIMEOUT_READ_MS,
    writeMs: agentEnv.AGENT_TOOL_TIMEOUT_WRITE_MS,
    maxMs: agentEnv.AGENT_TOOL_TIMEOUT_MAX_MS,
  });
  setBreakerConfig({
    failureThreshold: agentEnv.AGENT_TOOL_BREAKER_FAILURE_THRESHOLD,
    openMs: agentEnv.AGENT_TOOL_BREAKER_OPEN_MS,
  });
  setBreakerEventEmitter(buildBreakerEmitter());

  const { mastra, drainer } = buildMastraFull({
    pool: deps.pool,
    databaseUrl: deps.databaseUrl,
    log: deps.log,
    storage: deps.mastraStorage,
  });

  for (const spec of deps.reg.collected.agentSpecs) {
    mastra.addAgent(buildAgentFromSpec(spec));
  }

  for (const { contribution } of deps.reg.collected.workflowContributions) {
    contribution.build(mastra);
    if (contribution.inputSchema) {
      registerWorkflowInputSchema(contribution.id, contribution.inputSchema);
    }
  }
  initAgentRegistry();

  for (const spec of AgentRegistry.snapshot().workflows) {
    const wf = spec.workflow as AnyWorkflow;
    // Register under both keys: the spec alias (e.g. `assignBySkill`) for the
    // REST API path `/workflows/runs/:alias/start`, and the workflow's intrinsic
    // id (e.g. `planner.assignBySkill`) — the latter is what Mastra's snapshot
    // storage and our workflow_runs.workflow_id column use, so cancel/rerun/replay
    // paths that look up `mastra.getWorkflow(row.workflow_id)` need it too.
    mastra.addWorkflow(wf, spec.id);
    const intrinsicId = (wf as { id?: unknown }).id;
    if (typeof intrinsicId === 'string' && intrinsicId !== spec.id) {
      mastra.addWorkflow(wf, intrinsicId);
    }
    registerWorkflowInputSchema(spec.id, spec.inputSchema);
  }
  registerPendingAssignReader(getPendingAssignRunIdForTask);
  void mastra.startWorkers();

  // Working-memory factories (previously built inside the supervisor tree):
  // resource-scoped userContext (GuardedMemory) + thread-scoped conversation
  // entities. The chat route hands both to the orchestration run ctx.
  const userMem = buildMemory({ mastra, databaseUrl: deps.databaseUrl });
  const entitiesMem = buildEntitiesMemory({ mastra });

  return {
    attach(app) {
      registerAgentRoutes(app as never, {
        mastra,
        drainer,
        pool: deps.pool,
        log: deps.log,
        chatOrchestration: deps.chatOrchestration,
        resumeOrchestration: deps.resumeOrchestration,
        consumeThreadAttachments: deps.consumeThreadAttachments,
        markAttachmentsConsumed: deps.markAttachmentsConsumed,
        markAttachmentsFailed: deps.markAttachmentsFailed,
        entitiesMemory: entitiesMem?.memory,
        entitiesMemoryConfig: entitiesMem?.memoryConfig,
        userMemory: userMem?.memory,
        userMemoryConfig: userMem?.memoryConfig,
      });
    },
    mastra,
  };
}
