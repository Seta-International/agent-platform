import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
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
import { initClassifier } from './backend/domain-classifier.ts';
import { agentEnv } from './backend/env.ts';
import { initAgentRegistry } from './backend/init-registry.ts';
import { agentJobs } from './backend/jobs/rate-limit-cleanup.ts';
import { type ModelTier, resolveModel } from './backend/model-registry.ts';
import { registerAgentRoutes } from './backend/routes.ts';
import { buildMastra } from './backend/runtime.ts';
import { agentSubscribers } from './backend/subscribers/index.ts';
import { buildSupervisorTree } from './backend/supervisor-tree.ts';
import { registerWorkflowInputSchema } from './backend/workflows/_infra/input-schema-registry.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerAgentContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'agent',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle'),
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

export function registerAgent(deps: {
  pool: Pool;
  databaseUrl: string;
  reg: ContributionRegistry;
  log?: {
    error: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
}): AgentHandle {
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

  const mastra = buildMastra({ pool: deps.pool, databaseUrl: deps.databaseUrl, log: deps.log });

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
  void initClassifier();

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

  const { topSupervisor, domainAgents } = buildSupervisorTree({
    mastra,
    databaseUrl: deps.databaseUrl,
  });
  // Register the supervisor on Mastra so its agent instance gets the `#mastra`
  // back-reference. Without this, `agent.resumeStream()` (called by the chat
  // /approve route to resume a HITL-gated tool) throws
  // AGENT_RESUME_NO_SNAPSHOT_FOUND because `this.#mastra?.getStorage()`
  // returns undefined and the agentic-loop workflow snapshot can't be loaded.
  mastra.addAgent(topSupervisor);

  return {
    attach(app) {
      registerAgentRoutes(app as never, {
        supervisor: topSupervisor,
        domainAgents,
        mastra,
        pool: deps.pool,
        log: deps.log,
      });
    },
    mastra,
  };
}
