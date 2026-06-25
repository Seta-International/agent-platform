// packages/core/src/flags/strategies.ts
import type { FlagContext, FlagStrategy, FlagStrategyConfig } from './types.ts';

const registry = new Map<string, FlagStrategy>();

export function registerStrategy(s: FlagStrategy): void {
  registry.set(s.kind, s);
}

export function getStrategy(kind: string): FlagStrategy | undefined {
  return registry.get(kind);
}

export function knownStrategyKinds(): string[] {
  return [...registry.keys()];
}

export const enabledStrategy: FlagStrategy = {
  kind: 'enabled',
  evaluate: () => true,
};

export const memberAllowlistStrategy: FlagStrategy = {
  kind: 'member-allowlist',
  evaluate: (config, ctx) => {
    const ids = (config as { userIds?: unknown })?.userIds;
    return Array.isArray(ids) && ids.includes(ctx.userId);
  },
};

registerStrategy(enabledStrategy);
registerStrategy(memberAllowlistStrategy);

export function evaluateStrategies(
  strategies: readonly FlagStrategyConfig[],
  ctx: FlagContext,
  log?: { warn?: (o: unknown, m?: string) => void },
): boolean {
  for (const s of strategies) {
    const strat = registry.get(s.kind);
    if (!strat) {
      log?.warn?.({ kind: s.kind }, 'unknown feature-flag strategy kind (fail-closed)');
      continue;
    }
    if (strat.evaluate(s.config ?? {}, ctx)) return true;
  }
  return false;
}
