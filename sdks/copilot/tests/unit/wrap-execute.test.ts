import { RequestContext } from '@mastra/core/request-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetBreakerEmitterForTests } from '../../src/breaker-events';
import { __resetBreakersForTests } from '../../src/circuit-breaker';
import { ToolBreakerOpenError, ToolExecutionTimeoutError } from '../../src/errors';
import { __resetExecutionPolicyForTests } from '../../src/execution-policy';
import { wrapExecute } from '../../src/wrap-execute';

const TENANT_A = '00000000-0000-0000-0000-00000000000a';

function ctxFor(tenantId: string, abortSignal?: AbortSignal) {
  const rc = new RequestContext();
  rc.set('tenant_id', tenantId);
  return { requestContext: rc, abortSignal } as never;
}

describe('wrapExecute', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    __resetBreakersForTests();
    __resetBreakerEmitterForTests();
    __resetExecutionPolicyForTests();
  });

  it('forwards input to user execute and returns its value when fast', async () => {
    const userExec = vi.fn(async (input: { q: string }) => ({ value: input.q.toUpperCase() }));
    const wrapped = wrapExecute({ id: 't_read', needsApproval: false }, userExec);
    const result = await wrapped({ q: 'hi' }, ctxFor(TENANT_A));
    expect(result).toEqual({ value: 'HI' });
    expect(userExec).toHaveBeenCalledTimes(1);
  });

  it('throws ToolExecutionTimeoutError after the resolved timeout (read default 30s)', async () => {
    const wrapped = wrapExecute(
      { id: 't_slow_read', needsApproval: false },
      async (_input: unknown, ctx: { abortSignal?: AbortSignal }) =>
        new Promise<{ ok: boolean }>((_resolve, reject) => {
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        }),
    );
    const p = wrapped({}, ctxFor(TENANT_A));
    p.catch(() => {}); // attach handler before fake timers fire to avoid unhandledRejection
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
  });

  it('uses the write default (60s) when needsApproval=true', async () => {
    const wrapped = wrapExecute(
      { id: 't_slow_write', needsApproval: true },
      async (_input: unknown, ctx: { abortSignal?: AbortSignal }) =>
        new Promise<{ ok: boolean }>((_resolve, reject) => {
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        }),
    );
    const p = wrapped({}, ctxFor(TENANT_A));
    // Silence unhandled-rejection while the promise is still pending.
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(30_000);
    // At 30s the read timeout would have fired; the write tool is still pending.
    let settled = false;
    void p.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
  });

  it('respects an explicit executionTimeoutMs override', async () => {
    const wrapped = wrapExecute(
      { id: 't_explicit', needsApproval: false, executionTimeoutMs: 5_000 },
      async (_input: unknown, ctx: { abortSignal?: AbortSignal }) =>
        new Promise<{ ok: boolean }>((_resolve, reject) => {
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        }),
    );
    const p = wrapped({}, ctxFor(TENANT_A));
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
  });

  it('fails fast with ToolBreakerOpenError when the breaker for (tenant, tool) is open', async () => {
    // Force the breaker open via three consecutive failures.
    const failing = wrapExecute(
      { id: 't_break', needsApproval: false },
      async (_input: unknown, ctx: { abortSignal?: AbortSignal }) =>
        new Promise<{ ok: boolean }>((_resolve, reject) => {
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        }),
    );
    for (let i = 0; i < 3; i++) {
      const p = failing({}, ctxFor(TENANT_A));
      p.catch(() => {});
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
    }
    // Now the breaker is open — the working impl is rejected before it runs.
    const calls = vi.fn();
    const wrappedRef = wrapExecute({ id: 't_break', needsApproval: false }, async () => {
      calls();
      return { ok: true };
    });
    await expect(wrappedRef({}, ctxFor(TENANT_A))).rejects.toBeInstanceOf(ToolBreakerOpenError);
    expect(calls).not.toHaveBeenCalled();
  });

  it('a user-cancel via ctx.abortSignal does NOT record a breaker failure', async () => {
    const wrapped = wrapExecute(
      { id: 't_user_cancel', needsApproval: false },
      async (_input: unknown, ctx: { abortSignal?: AbortSignal }) =>
        new Promise<{ ok: boolean }>((_resolve, reject) => {
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        }),
    );
    // Three user-cancel runs in a row must not open the breaker.
    for (let i = 0; i < 3; i++) {
      const ac = new AbortController();
      const p = wrapped({}, ctxFor(TENANT_A, ac.signal));
      ac.abort(new Error('user stop'));
      await expect(p).rejects.toBeDefined();
    }
    // Probe with a working tool — must run.
    const calls = vi.fn();
    const probe = wrapExecute({ id: 't_user_cancel', needsApproval: false }, async () => {
      calls();
      return { ok: true };
    });
    await probe({}, ctxFor(TENANT_A));
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('records a breaker failure when the user execute throws synchronously', async () => {
    const wrapped = wrapExecute({ id: 't_throws', needsApproval: false }, async () => {
      throw new Error('boom');
    });
    for (let i = 0; i < 3; i++) {
      await expect(wrapped({}, ctxFor(TENANT_A))).rejects.toThrow('boom');
    }
    const calls = vi.fn();
    const probe = wrapExecute({ id: 't_throws', needsApproval: false }, async () => {
      calls();
      return { ok: true };
    });
    await expect(probe({}, ctxFor(TENANT_A))).rejects.toBeInstanceOf(ToolBreakerOpenError);
    expect(calls).not.toHaveBeenCalled();
  });

  it('injects a composed AbortSignal into ctx that fires on timeout', async () => {
    let inner: AbortSignal | undefined;
    const wrapped = wrapExecute(
      { id: 't_signal', needsApproval: false, executionTimeoutMs: 1_000 },
      async (_input: unknown, ctx: { abortSignal?: AbortSignal }) =>
        new Promise<{ ok: boolean }>((_resolve, reject) => {
          inner = ctx.abortSignal;
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        }),
    );
    const p = wrapped({}, ctxFor(TENANT_A));
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
    expect(inner?.aborted).toBe(true);
  });

  it('a caller-supplied ctx.abortSignal also triggers the composed signal', async () => {
    let inner: AbortSignal | undefined;
    const wrapped = wrapExecute(
      { id: 't_caller_abort', needsApproval: false },
      async (_input: unknown, ctx: { abortSignal?: AbortSignal }) =>
        new Promise<{ ok: boolean }>((_resolve, reject) => {
          inner = ctx.abortSignal;
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        }),
    );
    const ac = new AbortController();
    const p = wrapped({}, ctxFor(TENANT_A, ac.signal));
    ac.abort(new Error('caller cancel'));
    await expect(p).rejects.toBeDefined();
    expect(inner?.aborted).toBe(true);
  });

  it('a successful call records success and closes a half-open breaker', async () => {
    // Open the breaker.
    const failing = wrapExecute({ id: 't_recover', needsApproval: false }, async () => {
      throw new Error('boom');
    });
    for (let i = 0; i < 3; i++) {
      await expect(failing({}, ctxFor(TENANT_A))).rejects.toThrow('boom');
    }
    // Advance past the open window (default 60s) so the breaker is half-open.
    vi.advanceTimersByTime(60_000);

    const ok = wrapExecute({ id: 't_recover', needsApproval: false }, async () => ({ ok: true }));
    await expect(ok({}, ctxFor(TENANT_A))).resolves.toEqual({ ok: true });
    // Two more failures must not re-open immediately (counter was reset).
    await expect(failing({}, ctxFor(TENANT_A))).rejects.toThrow('boom');
    await expect(failing({}, ctxFor(TENANT_A))).rejects.toThrow('boom');
    await expect(ok({}, ctxFor(TENANT_A))).resolves.toEqual({ ok: true });
  });

  it('throws a clear error when ctx.requestContext.tenant_id is missing (boot misconfig)', async () => {
    const wrapped = wrapExecute({ id: 't_noactor', needsApproval: false }, async () => ({
      ok: true,
    }));
    const rc = new RequestContext();
    await expect(wrapped({}, { requestContext: rc } as never)).rejects.toThrow(/tenant id/i);
  });
});
