import type { ModuleKey, SubscriberDef } from '@seta/shared-types';

export interface ContributionRegistry {
  schema(mod: ModuleKey, schema: Record<string, unknown>): void;
  migrationsDir(mod: ModuleKey, dir: string): void;
  subscribers(subs: SubscriberDef[]): void;
  publicApi(mod: ModuleKey, api: Record<string, unknown>): void;
  readonly collected: {
    schemas: ReadonlyMap<ModuleKey, Record<string, unknown>>;
    migrationDirs: ReadonlyArray<{ module: ModuleKey; dir: string }>;
    subscribers: ReadonlyArray<SubscriberDef>;
    publicApis: ReadonlyMap<ModuleKey, Record<string, unknown>>;
  };
}

export function createContributionRegistry(): ContributionRegistry {
  const schemas = new Map<ModuleKey, Record<string, unknown>>();
  const migrationDirs: { module: ModuleKey; dir: string }[] = [];
  const subscribers: SubscriberDef[] = [];
  const publicApis = new Map<ModuleKey, Record<string, unknown>>();

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
    collected: { schemas, migrationDirs, subscribers, publicApis },
  };
}
