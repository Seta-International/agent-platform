import type { ToolExecutionContext } from '@mastra/core/tools';
import { getBreaker } from './circuit-breaker.ts';
import { anySignal } from './compose-signals.ts';
import {
  AgentToolError,
  type AgentToolErrorCode,
  ToolBreakerOpenError,
  ToolExecutionTimeoutError,
} from './errors.ts';
import { resolveTimeoutMs } from './execution-policy.ts';

type WrappableCtx = ToolExecutionContext<unknown, unknown, Record<string, unknown>>;

type UserExecute<I, O> = (input: I, ctx: WrappableCtx) => Promise<O | undefined>;

interface WrappableSpec {
  id: string;
  needsApproval?: boolean | ((...args: never[]) => unknown);
  executionTimeoutMs?: number;
}

const DOMAIN_CODE_MAP: Record<
  string,
  { code: AgentToolErrorCode; retryable: boolean; userMessage: string }
> = {
  FORBIDDEN: {
    code: 'PERMISSION_DENIED',
    retryable: false,
    userMessage: 'You do not have permission to perform this action.',
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    retryable: false,
    userMessage: 'The requested resource was not found.',
  },
  CONFLICT: {
    code: 'CONFLICT',
    retryable: false,
    userMessage: 'A conflict prevented this operation.',
  },
  VALIDATION: {
    code: 'VALIDATION',
    retryable: false,
    userMessage: 'The request was invalid. Check the inputs and try again.',
  },
  rate_limited: {
    code: 'RATE_LIMITED',
    retryable: true,
    userMessage: 'Rate limit reached. The agent will retry shortly.',
  },
};

function toAgentToolError(err: unknown, toolId: string): AgentToolError {
  if (err instanceof AgentToolError) return err;

  const code = (err as { code?: unknown }).code;
  const domainMsg = (err as { message?: unknown }).message;
  const rawMsg =
    err instanceof Error ? err.message : typeof domainMsg === 'string' ? domainMsg : String(err);
  const match = typeof code === 'string' ? DOMAIN_CODE_MAP[code] : undefined;

  if (match) {
    return new AgentToolError({ ...match, internalDetail: rawMsg, toolId });
  }

  return new AgentToolError({
    code: 'TOOL_ERROR',
    retryable: false,
    userMessage: 'An internal error occurred. Please try again or contact support.',
    internalDetail: rawMsg,
    toolId,
  });
}

/**
 * Build a Mastra-compatible execute function that adds timeout, AbortSignal
 * composition, circuit-breaker semantics, and structured error taxonomy around
 * the tool author's `execute`. Behaviour:
 *
 *   1. Read tenant id from ctx.requestContext (throws if missing).
 *   2. If the (toolId, tenantId) breaker is open, fail fast with
 *      ToolBreakerOpenError (extends AgentToolError).
 *   3. Compose ctx.abortSignal with a fresh timeout-driven AbortController and
 *      pass the composed signal back in via the ctx the user sees.
 *   4. Race the user's promise against the timeout. On timer fire abort the
 *      composed signal and throw ToolExecutionTimeoutError (extends AgentToolError).
 *   5. Record breaker outcome.
 *   6. Outer catch-all: user-initiated cancellations propagate as-is; pre-existing
 *      AgentToolError instances re-throw as-is; all other exceptions are converted
 *      to AgentToolError via duck-typed .code mapping, with internalDetail logged
 *      and only the safe userMessage exposed as .message.
 */
export function wrapExecute<I, O>(spec: WrappableSpec, userExecute: UserExecute<I, O>) {
  return async function wrappedExecute(input: I, ctx: WrappableCtx): Promise<O | undefined> {
    try {
      return await executeWithTimeoutAndBreaker(spec, userExecute, input, ctx);
    } catch (err) {
      // User-initiated cancellation is not a tool failure — propagate raw.
      if (ctx.abortSignal?.aborted) throw err;
      // Already a structured AgentToolError (Timeout, BreakerOpen, etc.) — re-throw as-is.
      if (err instanceof AgentToolError) throw err;
      // Convert domain / unknown errors; log internal details for debugging.
      const structured = toAgentToolError(err, spec.id);
      console.error('[agent.tool-error]', {
        toolId: spec.id,
        code: structured.code,
        retryable: structured.retryable,
        internalDetail: structured.internalDetail,
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw structured;
    }
  };
}

async function executeWithTimeoutAndBreaker<I, O>(
  spec: WrappableSpec,
  userExecute: UserExecute<I, O>,
  input: I,
  ctx: WrappableCtx,
): Promise<O | undefined> {
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
      throw err;
    }
    breaker.recordFailure('exception');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function tenantIdFromCtx(ctx: WrappableCtx): string {
  const tenantId = ctx.requestContext?.get('tenant_id');
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new Error(
      'wrapExecute: missing tenant id in ctx.requestContext — every agent invocation must set the tenant_id entry via requestContext.set("tenant_id", ...) (see packages/agent/src/backend/routes.ts).',
    );
  }
  return tenantId;
}
