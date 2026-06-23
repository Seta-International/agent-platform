// packages/core/src/flags/types.ts
export interface FlagContext {
  tenantId: string;
  userId: string;
  roles: readonly string[];
}

export interface FlagStrategy {
  kind: string;
  evaluate(config: unknown, ctx: FlagContext): boolean;
}

export interface FlagStrategyConfig {
  kind: string;
  config?: Record<string, unknown>;
}

export interface FlagDef {
  key: string;
  description: string;
  defaultEnabled?: boolean;
}

export interface FlagRow {
  key: string;
  tenant_id: string | null;
  strategies: FlagStrategyConfig[];
}
