// packages/core/src/flags/provider.ts

import type { Logger } from '@openfeature/server-sdk';
import {
  type EvaluationContext,
  type JsonValue,
  OpenFeatureEventEmitter,
  type Provider,
  type ResolutionDetails,
} from '@openfeature/server-sdk';
import { evaluateStrategies } from './strategies.ts';
import type { FlagContext, FlagRow } from './types.ts';

type WarnLogger = { warn?: (o: unknown, m?: string) => void };

function toFlagContext(ctx: EvaluationContext): FlagContext | null {
  const userId = (ctx.userId ?? ctx.targetingKey) as string | undefined;
  const tenantId = ctx.tenantId as string | undefined;
  if (!userId || !tenantId) return null;
  const roles = Array.isArray(ctx.roles) ? (ctx.roles as string[]) : [];
  return { tenantId, userId, roles };
}

export interface SetaFeatureProviderDeps {
  getEffectiveFlag: (tenantId: string, key: string) => Promise<FlagRow | undefined>;
  log?: WarnLogger;
}

export class SetaFeatureProvider implements Provider {
  readonly runsOn = 'server' as const;
  readonly metadata = { name: 'seta-flags' } as const;
  readonly events = new OpenFeatureEventEmitter();

  private readonly deps: SetaFeatureProviderDeps;
  constructor(deps: SetaFeatureProviderDeps) {
    this.deps = deps;
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    try {
      const ctx = toFlagContext(context);
      if (!ctx) return { value: defaultValue, reason: 'ERROR' };
      const row = await this.deps.getEffectiveFlag(ctx.tenantId, flagKey);
      if (!row) return { value: defaultValue, reason: 'DEFAULT' };
      return {
        value: evaluateStrategies(row.strategies, ctx, this.deps.log),
        reason: 'TARGETING_MATCH',
      };
    } catch (err) {
      this.deps.log?.warn?.({ err, flagKey }, 'feature-flag evaluation error (returning default)');
      return { value: defaultValue, reason: 'ERROR' };
    }
  }

  // Seta flags are boolean-only; the SDK requires the other resolvers. Fail-safe to default.
  async resolveStringEvaluation(
    _k: string,
    d: string,
    _ctx: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    return { value: d, reason: 'ERROR' };
  }
  async resolveNumberEvaluation(
    _k: string,
    d: number,
    _ctx: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    return { value: d, reason: 'ERROR' };
  }
  async resolveObjectEvaluation<T extends JsonValue>(
    _k: string,
    d: T,
    _ctx: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    return { value: d, reason: 'ERROR' };
  }
}
