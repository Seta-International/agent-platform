import { RequestContext } from '@mastra/core/request-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { __resetBreakerEmitterForTests } from '../../src/breaker-events';
import { __resetBreakersForTests } from '../../src/circuit-breaker';
import { defineCopilotTool } from '../../src/define-copilot-tool';
import { ToolExecutionTimeoutError } from '../../src/errors';
import { __resetExecutionPolicyForTests } from '../../src/execution-policy';

const TENANT_A = '00000000-0000-0000-0000-00000000000a';

function ctxFor() {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: '00000000-0000-0000-0000-000000000099' });
  rc.set('tenant_id', TENANT_A);
  return { requestContext: rc } as never;
}

// Mock async I/O resource: a promise that the caller can cancel via AbortSignal.
// Tracks whether cancel() ran so we can assert resource release.
function makeCancelableIO(signal: AbortSignal | undefined) {
  let cancelled = false;
  const promise = new Promise<string>((_resolve, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      cancelled = true;
      reject(signal.reason);
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        cancelled = true;
        reject(signal.reason);
      },
      { once: true },
    );
  });
  return { promise, didCancel: () => cancelled };
}

describe('defineCopilotTool — AbortSignal propagation (AC3 + AC4)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    __resetBreakersForTests();
    __resetBreakerEmitterForTests();
    __resetExecutionPolicyForTests();
  });

  it('on timeout, ctx.abortSignal fires and a forwarding I/O call cancels (AC4)', async () => {
    let io: ReturnType<typeof makeCancelableIO> | undefined;
    const tool = defineCopilotTool({
      id: 't.forward',
      name: 'Forwarder',
      description: 'Forwards signal to I/O.',
      input: z.object({}),
      output: z.object({ value: z.string() }),
      executionTimeoutMs: 5_000,
      execute: async (_input, ctx) => {
        io = makeCancelableIO(ctx.abortSignal);
        const value = await io.promise;
        return { value };
      },
    });
    const p = (tool as { execute: (i: unknown, c: unknown) => Promise<unknown> }).execute(
      {},
      ctxFor(),
    );
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
    expect(io?.didCancel()).toBe(true);
  });

  it('a tool that ignores ctx.abortSignal still has its composed signal aborted at the deadline (AC2/AC3)', async () => {
    // The wrapper's contract: if the user execute never settles even after
    // abort, the outer promise also never settles — but the composed
    // ctx.abortSignal IS aborted on time, so any I/O the user *does* forward
    // it to will be released. This test asserts that abort-at-deadline.
    let captured: AbortSignal | undefined;
    const tool = defineCopilotTool({
      id: 't.ignores',
      name: 'Ignorer',
      description: 'Captures the signal but never settles.',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      executionTimeoutMs: 5_000,
      execute: (_input, ctx) => {
        captured = ctx.abortSignal;
        return new Promise<{ ok: boolean }>(() => {}); // never settles
      },
    });
    const p = (tool as { execute: (i: unknown, c: unknown) => Promise<unknown> }).execute(
      {},
      ctxFor(),
    );
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_000);
    expect(captured?.aborted).toBe(true);
    expect(captured?.reason).toBeInstanceOf(ToolExecutionTimeoutError);
  });
});
