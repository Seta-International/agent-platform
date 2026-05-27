import type {
  AgentToolFactory,
  CopilotTool,
  SubscriberBuilder,
  WorkflowContribution,
} from '@seta/copilot-sdk';
import type { SubscriberDef } from '@seta/shared-types';
import type { Task, TaskList } from 'graphile-worker';
import type { Hono } from 'hono';
import type { Pool } from 'pg';
import type { z } from 'zod';
import type { WorkerHandle } from '../runtime/workers/index.ts';

export type JobHandler = Task;

export interface RouteBuildDeps {
  pool: Pool;
  workers: WorkerHandle;
  streams: ReadonlyMap<string, unknown>;
  log?: {
    error: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Hono's env generic is invariant; route builders return Hono<SessionEnv> and we collect them via this widened any.
export type AnyHono = Hono<any, any, any>;

export interface RouteContribution {
  mountAt: string;
  build: (deps: RouteBuildDeps) => AnyHono;
}

export interface StreamHubBuildDeps {
  pool: Pool;
}

export type StreamHubHandle = {
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
  [k: string]: unknown;
};

export type StreamHubBuilder = (deps: StreamHubBuildDeps) => StreamHubHandle;

export interface AgentSpec {
  id: string;
  defaultTier?: string;
  instructions: string;
  tools: string[];
  delegates?: string[];
  rbac: string[];
}

export type ErrorMapper = (err: Error) => { status: number; body: unknown } | null;

export interface ModuleContribution {
  name: string;
  schema: Record<string, unknown>;
  migrationsDir: string;
  events?: Record<string, z.ZodSchema>;
  rbac?: Record<string, string>;
  subscribers?: SubscriberDef[];
  /**
   * Deferred-construction subscribers — invoked by the copilot engine post-Mastra
   * build so the resulting `SubscriberDef`s can hold a Mastra reference. Engine
   * merges them into the runtime's dispatcher list alongside `subscribers`.
   */
  subscriberBuilders?: SubscriberBuilder[];
  jobs?: TaskList;
  routes?: RouteContribution;
  stream?: StreamHubBuilder;
  agentTools?: CopilotTool[];
  /**
   * Tools whose construction requires shared runtime deps (embedding provider,
   * pg pool, reranker). Copilot instantiates each factory once with those deps
   * and merges the resulting tool into the agent-tool pool.
   */
  agentToolFactories?: AgentToolFactory[];
  agentSpecs?: AgentSpec[];
  workflows?: WorkflowContribution[];
  errorMapper?: ErrorMapper;
}

export interface ContributionRegistry {
  module(contribution: ModuleContribution): void;
  readonly collected: {
    schemas: ReadonlyMap<string, Record<string, unknown>>;
    migrationDirs: ReadonlyArray<{ module: string; dir: string }>;
    subscribers: ReadonlyArray<SubscriberDef>;
    jobs: ReadonlyMap<string, JobHandler>;
    routes: ReadonlyArray<{ module: string; mountAt: string; build: RouteContribution['build'] }>;
    streamHubBuilders: ReadonlyArray<{ module: string; builder: StreamHubBuilder }>;
    agentTools: ReadonlyArray<CopilotTool>;
    agentToolFactories: ReadonlyArray<{ module: string; factory: AgentToolFactory }>;
    agentSpecs: ReadonlyArray<AgentSpec>;
    workflowContributions: ReadonlyArray<{ module: string; contribution: WorkflowContribution }>;
    subscriberBuilders: ReadonlyArray<{ module: string; builder: SubscriberBuilder }>;
    errorMappers: ReadonlyArray<{ module: string; mapper: ErrorMapper }>;
    rbacByModule: ReadonlyMap<string, Record<string, string>>;
    eventsByModule: ReadonlyMap<string, Record<string, z.ZodSchema>>;
  };
}

export function createContributionRegistry(): ContributionRegistry {
  const schemas = new Map<string, Record<string, unknown>>();
  const migrationDirs: { module: string; dir: string }[] = [];
  const subscribers: SubscriberDef[] = [];
  const jobs = new Map<string, JobHandler>();
  const routes: { module: string; mountAt: string; build: RouteContribution['build'] }[] = [];
  const streamHubBuilders: { module: string; builder: StreamHubBuilder }[] = [];
  const agentTools: CopilotTool[] = [];
  const agentToolFactories: { module: string; factory: AgentToolFactory }[] = [];
  const agentSpecs: AgentSpec[] = [];
  const workflowContributions: { module: string; contribution: WorkflowContribution }[] = [];
  const subscriberBuilders: { module: string; builder: SubscriberBuilder }[] = [];
  const errorMappers: { module: string; mapper: ErrorMapper }[] = [];
  const rbacByModule = new Map<string, Record<string, string>>();
  const eventsByModule = new Map<string, Record<string, z.ZodSchema>>();
  const seenToolIds = new Set<string>();
  const seenAgentSpecIds = new Set<string>();
  const seenPermissionSlugs = new Set<string>();

  function module(c: ModuleContribution): void {
    if (schemas.has(c.name)) throw new Error(`module registered twice: ${c.name}`);
    schemas.set(c.name, c.schema);
    migrationDirs.push({ module: c.name, dir: c.migrationsDir });
    if (c.subscribers) subscribers.push(...c.subscribers);
    if (c.jobs) {
      for (const [taskName, handler] of Object.entries(c.jobs)) {
        if (handler === undefined) continue;
        if (jobs.has(taskName)) throw new Error(`duplicate job name: ${taskName}`);
        jobs.set(taskName, handler);
      }
    }
    if (c.routes) {
      // Route handlers register absolute paths internally, so the mountAt is
      // typically '/' — modules with absolute paths inside the contributed Hono
      // app don't need a prefix. Duplicate names already guarded by module-name
      // uniqueness above.
      if (!c.routes.mountAt.startsWith('/')) {
        throw new Error(`route mountAt for ${c.name} must start with /, got ${c.routes.mountAt}`);
      }
      routes.push({ module: c.name, mountAt: c.routes.mountAt, build: c.routes.build });
    }
    if (c.stream) streamHubBuilders.push({ module: c.name, builder: c.stream });
    if (c.agentTools) {
      for (const tool of c.agentTools) {
        const id = (tool as { id?: string }).id;
        if (!id) throw new Error('agent tool is missing its required id field');
        if (seenToolIds.has(id)) throw new Error(`duplicate agent tool id: ${id}`);
        seenToolIds.add(id);
        agentTools.push(tool);
      }
    }
    if (c.agentToolFactories) {
      for (const factory of c.agentToolFactories) {
        agentToolFactories.push({ module: c.name, factory });
      }
    }
    if (c.agentSpecs) {
      for (const spec of c.agentSpecs) {
        if (seenAgentSpecIds.has(spec.id)) throw new Error(`duplicate agent spec id: ${spec.id}`);
        seenAgentSpecIds.add(spec.id);
        agentSpecs.push(spec);
      }
    }
    if (c.workflows) {
      for (const contribution of c.workflows)
        workflowContributions.push({ module: c.name, contribution });
    }
    if (c.subscriberBuilders) {
      for (const builder of c.subscriberBuilders)
        subscriberBuilders.push({ module: c.name, builder });
    }
    if (c.errorMapper) errorMappers.push({ module: c.name, mapper: c.errorMapper });
    if (c.rbac) {
      for (const slug of Object.keys(c.rbac)) {
        if (seenPermissionSlugs.has(slug)) throw new Error(`duplicate permission slug: ${slug}`);
        seenPermissionSlugs.add(slug);
      }
      rbacByModule.set(c.name, c.rbac);
    }
    if (c.events) eventsByModule.set(c.name, c.events);
  }

  return {
    module,
    collected: {
      schemas,
      migrationDirs,
      subscribers,
      jobs,
      routes,
      streamHubBuilders,
      agentTools,
      agentToolFactories,
      agentSpecs,
      workflowContributions,
      subscriberBuilders,
      errorMappers,
      rbacByModule,
      eventsByModule,
    },
  };
}
