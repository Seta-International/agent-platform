import type { ToolExecutionContext } from '@mastra/core/tools';
import { getBreaker } from './circuit-breaker.ts';
import { anySignal } from './compose-signals.ts';
import { ToolBreakerOpenError, ToolExecutionTimeoutError } from './errors.ts';
import { resolveTimeoutMs } from './execution-policy.ts';

type WrappableCtx = ToolExecutionContext<unknown, unknown, Record<string, unknown>>;

type UserExecute<I, O> = (input: I, ctx: WrappableCtx) => Promise<O | undefined>;

interface WrappableSpec {
  id: string;
  needsApproval?: boolean | ((...args: never[]) => unknown);
  executionTimeoutMs?: number;
}

/**
 * Build a Mastra-compatible execute function that adds timeout, AbortSignal
 * composition, and circuit-breaker semantics around the tool author's
 * `execute`. Behaviour:
 *
 *   1. Read tenant id from ctx.requestContext (throws if missing).
 *   2. If the (toolId, tenantId) breaker is open, fail fast with
 *      ToolBreakerOpenError.
 *   3. Compose ctx.abortSignal with a fresh timeout-driven AbortController and
 *      pass the composed signal back in via the ctx the user sees.
 *   4. Race the user's promise against the timeout. On timer fire abort the
 *      composed signal and, after the promise settles, throw
 *      ToolExecutionTimeoutError.
 *   5. Record breaker outcome:
 *        - success            → recordSuccess()
 *        - timeout            → recordFailure('timeout')
 *        - user-cancel        → no record (not the tool's fault)
 *        - any other throw    → recordFailure('exception')
 */
export function wrapExecute<I, O>(spec: WrappableSpec, userExecute: UserExecute<I, O>) {
  return async function wrappedExecute(input: I, ctx: WrappableCtx): Promise<O | undefined> {
    const tenantId = tenantIdFromCtx(ctx);
    const breaker = getBreaker(spec.id, tenantId);

    if (breaker.isOpen()) {
      throw new ToolBreakerOpenError(spec.id, breaker.openUntil);
    }

    const timeoutMs = resolveTimeoutMs(spec);
    const timeoutController = new AbortController();
    const composed = anySignal([ctx.abortSignal, timeoutController.signal]);
    const callerSignal = ctx.abortSignal;

    const timer = setTimeout(() => {
      timeoutController.abort(new ToolExecutionTimeoutError(spec.id, timeoutMs));
    }, timeoutMs);

    try {
      const result = await userExecute(input, { ...ctx, abortSignal: composed });

      if (timeoutController.signal.aborted) {
        // The user's execute returned a value despite our timeout firing —
        // treat it as a timeout from the agent's perspective so a swallowed
        // AbortError can't masquerade as success.
        breaker.recordFailure('timeout');
        throw new ToolExecutionTimeoutError(spec.id, timeoutMs);
      }
      breaker.recordSuccess();
      return result;
    } catch (err) {
      if (timeoutController.signal.aborted) {
        breaker.recordFailure('timeout');
        throw new ToolExecutionTimeoutError(spec.id, timeoutMs);
      }
      if (callerSignal?.aborted) {
        // User cancelled — propagate as-is, do not blame the tool.
        throw err;
      }
      breaker.recordFailure('exception');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}

function tenantIdFromCtx(ctx: WrappableCtx): string {
  const tenantId = ctx.requestContext?.get('tenant_id');
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new Error(
      'wrapExecute: missing tenant id in ctx.requestContext — every agent invocation must set the tenant_id entry via requestContext.set("tenant_id", ...) (see packages/copilot/src/backend/routes.ts).',
    );
  }
  return tenantId;
}
