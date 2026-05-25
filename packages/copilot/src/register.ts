import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { AnyWorkflow } from '@mastra/core/workflows';
import { CopilotRegistry, registerPendingAssignReader } from '@seta/copilot-sdk';
import type { AgentSpec, ContributionRegistry } from '@seta/core';
import type { Hono } from 'hono';
import type { Pool } from 'pg';
import * as schema from './backend/db/schema.ts';
import { getPendingAssignRunIdForTask } from './backend/domain/get-pending-assign-run-for-task.ts';
import { initCopilotRegistry } from './backend/init-registry.ts';
import { type ModelTier, resolveModel } from './backend/model-registry.ts';
import { registerCopilotRoutes } from './backend/routes.ts';
import { buildMastra } from './backend/runtime.ts';
import { copilotSubscribers } from './backend/subscribers/index.ts';
import { buildSupervisorTree } from './backend/supervisor-tree.ts';
import { registerWorkflowInputSchema } from './backend/workflows/_infra/input-schema-registry.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerCopilotContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'copilot',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle'),
    subscribers: copilotSubscribers(),
  });
}

export type CopilotHandle = {
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

export function registerCopilot(deps: {
  pool: Pool;
  databaseUrl: string;
  reg: ContributionRegistry;
}): CopilotHandle {
  const mastra = buildMastra({ pool: deps.pool, databaseUrl: deps.databaseUrl });

  for (const spec of deps.reg.collected.agentSpecs) {
    mastra.addAgent(buildAgentFromSpec(spec));
  }

  for (const { contribution } of deps.reg.collected.workflowContributions) {
    contribution.build(mastra);
    if (contribution.inputSchema) {
      registerWorkflowInputSchema(contribution.id, contribution.inputSchema);
    }
  }
  initCopilotRegistry();

  for (const spec of CopilotRegistry.snapshot().workflows) {
    mastra.addWorkflow(spec.workflow as AnyWorkflow, spec.id);
    registerWorkflowInputSchema(spec.id, spec.inputSchema);
  }
  registerPendingAssignReader(getPendingAssignRunIdForTask);
  void mastra.startWorkers();

  const supervisor = buildSupervisorTree({ mastra });

  return {
    attach(app) {
      registerCopilotRoutes(app as never, { supervisor, mastra, pool: deps.pool });
    },
    mastra,
  };
}
