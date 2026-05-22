import type { WorkflowBuilder } from '@seta/copilot-sdk';
import type { SubscriberDef } from '@seta/shared-types';

export interface ContributionRegistry {
  schema(mod: string, schema: Record<string, unknown>): void;
  migrationsDir(mod: string, dir: string): void;
  subscribers(subs: SubscriberDef[]): void;
  publicApi(mod: string, api: Record<string, unknown>): void;
  workflows(mod: string, builders: WorkflowBuilder[]): void;
  readonly collected: {
    schemas: ReadonlyMap<string, Record<string, unknown>>;
    migrationDirs: ReadonlyArray<{ module: string; dir: string }>;
    subscribers: ReadonlyArray<SubscriberDef>;
    publicApis: ReadonlyMap<string, Record<string, unknown>>;
    workflowBuilders: ReadonlyArray<{ module: string; builder: WorkflowBuilder }>;
  };
}

export function createContributionRegistry(): ContributionRegistry {
  const schemas = new Map<string, Record<string, unknown>>();
  const migrationDirs: { module: string; dir: string }[] = [];
  const subscribers: SubscriberDef[] = [];
  const publicApis = new Map<string, Record<string, unknown>>();
  const workflowBuilders: { module: string; builder: WorkflowBuilder }[] = [];

  return {
    schema(mod, schema) {
      schemas.set(mod, schema);
    },
    migrationsDir(mod, dir) {
      migrationDirs.push({ module: mod, dir });
    },
    subscribers(subs) {
      subscribers.push(...subs);
    },
    publicApi(mod, api) {
      publicApis.set(mod, api);
    },
    workflows(mod, builders) {
      for (const builder of builders) {
        workflowBuilders.push({ module: mod, builder });
      }
    },
    collected: { schemas, migrationDirs, subscribers, publicApis, workflowBuilders },
  };
}
