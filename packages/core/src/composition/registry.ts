import type { CopilotTool, WorkflowBuilder } from '@seta/copilot-sdk';
import type { SubscriberDef } from '@seta/shared-types';
import type { Hono } from 'hono';
import type { z } from 'zod';

export type JobHandler = (payload: unknown) => Promise<void>;

export interface RouteContribution {
  mountAt: string;
  build: (deps: unknown) => Hono;
}

export type StreamHubBuilder = (deps: unknown) => {
  start: () => void;
  stop: () => void;
  [k: string]: unknown;
};

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
  jobs?: Record<string, JobHandler>;
  routes?: RouteContribution;
  stream?: StreamHubBuilder;
  agentTools?: CopilotTool[];
  agentSpecs?: AgentSpec[];
  workflows?: WorkflowBuilder[];
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
    agentSpecs: ReadonlyArray<AgentSpec>;
    workflowBuilders: ReadonlyArray<{ module: string; builder: WorkflowBuilder }>;
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
  const agentSpecs: AgentSpec[] = [];
  const workflowBuilders: { module: string; builder: WorkflowBuilder }[] = [];
  const errorMappers: { module: string; mapper: ErrorMapper }[] = [];
  const rbacByModule = new Map<string, Record<string, string>>();
  const eventsByModule = new Map<string, Record<string, z.ZodSchema>>();
  const seenToolIds = new Set<string>();
  const seenAgentSpecIds = new Set<string>();
  const seenPermissionSlugs = new Set<string>();
  const seenMountPaths = new Set<string>();

  function module(c: ModuleContribution): void {
    if (schemas.has(c.name)) throw new Error(`module registered twice: ${c.name}`);
    schemas.set(c.name, c.schema);
    migrationDirs.push({ module: c.name, dir: c.migrationsDir });
    if (c.subscribers) subscribers.push(...c.subscribers);
    if (c.jobs) {
      for (const [taskName, handler] of Object.entries(c.jobs)) {
        if (jobs.has(taskName)) throw new Error(`duplicate job name: ${taskName}`);
        jobs.set(taskName, handler);
      }
    }
    if (c.routes) {
      if (seenMountPaths.has(c.routes.mountAt)) {
        throw new Error(`duplicate route mountAt: ${c.routes.mountAt}`);
      }
      const expectedPrefix = `/api/${c.name}/v`;
      if (!c.routes.mountAt.startsWith(expectedPrefix)) {
        throw new Error(
          `route mountAt for ${c.name} must start with ${expectedPrefix}, got ${c.routes.mountAt}`,
        );
      }
      seenMountPaths.add(c.routes.mountAt);
      routes.push({ module: c.name, mountAt: c.routes.mountAt, build: c.routes.build });
    }
    if (c.stream) streamHubBuilders.push({ module: c.name, builder: c.stream });
    if (c.agentTools) {
      for (const tool of c.agentTools) {
        if (seenToolIds.has(tool.id)) throw new Error(`duplicate agent tool id: ${tool.id}`);
        seenToolIds.add(tool.id);
        agentTools.push(tool);
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
      for (const builder of c.workflows) workflowBuilders.push({ module: c.name, builder });
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
      agentSpecs,
      workflowBuilders,
      errorMappers,
      rbacByModule,
      eventsByModule,
    },
  };
}
