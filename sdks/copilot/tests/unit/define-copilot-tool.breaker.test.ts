import { RequestContext } from '@mastra/core/request-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { __resetBreakerEmitterForTests, setBreakerEventEmitter } from '../../src/breaker-events';
import { __resetBreakersForTests } from '../../src/circuit-breaker';
import { defineCopilotTool } from '../../src/define-copilot-tool';
import { ToolBreakerOpenError, ToolExecutionTimeoutError } from '../../src/errors';
import { __resetExecutionPolicyForTests } from '../../src/execution-policy';

const TENANT_A = '00000000-0000-0000-0000-00000000000a';
const TENANT_B = '00000000-0000-0000-0000-00000000000b';

function ctxFor(tenantId: string) {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: '00000000-0000-0000-0000-000000000099' });
  rc.set('tenant_id', tenantId);
  return { requestContext: rc } as never;
}

function getExecute(tool: unknown): (input: unknown, ctx: unknown) => Promise<unknown> {
  return (tool as { execute: (input: unknown, ctx: unknown) => Promise<unknown> }).execute;
}

describe('defineCopilotTool — breaker integration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    __resetBreakersForTests();
    __resetBreakerEmitterForTests();
    __resetExecutionPolicyForTests();
  });

  it('three consecutive timeouts open the breaker for that (tenant, tool)', async () => {
    const tool = defineCopilotTool({
      id: 't.broken',
      name: 'Broken',
      description: 'Always hangs.',
      input: z.object({}),
      output: z.object({}),
      execute: async (_input, ctx) =>
        new Promise<{ ok: boolean }>((_resolve, reject) => {
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        }),
    });
    const events: unknown[] = [];
    setBreakerEventEmitter((e) => {
      events.push(e);
    });

    for (let i = 0; i < 3; i++) {
      const p = getExecute(tool)({}, ctxFor(TENANT_A));
      p.catch(() => {});
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
    }

    await expect(getExecute(tool)({}, ctxFor(TENANT_A))).rejects.toBeInstanceOf(
      ToolBreakerOpenError,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tool_id: 't.broken',
      tenant_id: TENANT_A,
      reason: 'timeout',
      failure_count: 3,
    });
  });

  it('tenant B is unaffected when tenant A trips the breaker', async () => {
    const tool = defineCopilotTool({
      id: 't.isolated',
      name: 'Isolated',
      description: 'Hangs for A, fast for everyone.',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      execute: async (_input, ctx) =>
        new Promise<{ ok: boolean }>((resolve, reject) => {
          const tenant = ctx.requestContext?.get('tenant_id' as never) as string | undefined;
          if (tenant === TENANT_A) {
            ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
              once: true,
            });
          } else {
            resolve({ ok: true });
          }
        }),
    });

    for (let i = 0; i < 3; i++) {
      const p = getExecute(tool)({}, ctxFor(TENANT_A));
      p.catch(() => {});
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
    }
    await expect(getExecute(tool)({}, ctxFor(TENANT_A))).rejects.toBeInstanceOf(
      ToolBreakerOpenError,
    );
    await expect(getExecute(tool)({}, ctxFor(TENANT_B))).resolves.toEqual({ ok: true });
  });

  it('a half-open probe success closes the breaker', async () => {
    let mode: 'hang' | 'ok' = 'hang';
    const tool = defineCopilotTool({
      id: 't.recover',
      name: 'Recover',
      description: 'Toggle.',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      execute: async (_input, ctx) => {
        if (mode === 'ok') return { ok: true };
        return new Promise<{ ok: boolean }>((_resolve, reject) => {
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        });
      },
    });

    for (let i = 0; i < 3; i++) {
      const p = getExecute(tool)({}, ctxFor(TENANT_A));
      p.catch(() => {});
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
    }
    await expect(getExecute(tool)({}, ctxFor(TENANT_A))).rejects.toBeInstanceOf(
      ToolBreakerOpenError,
    );

    // Advance past the open window — breaker is half-open.
    vi.advanceTimersByTime(60_000);
    mode = 'ok';
    await expect(getExecute(tool)({}, ctxFor(TENANT_A))).resolves.toEqual({ ok: true });
    // Counter is reset — two timeouts must not re-open.
    mode = 'hang';
    for (let i = 0; i < 2; i++) {
      const p = getExecute(tool)({}, ctxFor(TENANT_A));
      p.catch(() => {});
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
    }
    mode = 'ok';
    await expect(getExecute(tool)({}, ctxFor(TENANT_A))).resolves.toEqual({ ok: true });
  });
});
