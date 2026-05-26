import { RequestContext } from '@mastra/core/request-context';
import {
  __resetBreakerEmitterForTests,
  __resetBreakersForTests,
  __resetExecutionPolicyForTests,
  defineCopilotTool,
  setExecutionPolicy,
  ToolExecutionTimeoutError,
} from '@seta/copilot-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

const TENANT = '00000000-0000-0000-0000-000000000001';

describe('tool execution timeout — integration smoke', () => {
  beforeEach(() => {
    __resetBreakersForTests();
    __resetBreakerEmitterForTests();
    __resetExecutionPolicyForTests();
    // Small budget so the test finishes fast under real wall-clock time.
    setExecutionPolicy({ readMs: 500, writeMs: 500, maxMs: 1_000 });
  });

  it('surfaces ToolExecutionTimeoutError on the real clock when a tool hangs', async () => {
    const hangingTool = defineCopilotTool({
      id: 'test.hanging',
      name: 'Hanging tool',
      description: 'Always hangs.',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      execute: (_input, ctx) =>
        new Promise<{ ok: boolean }>((_resolve, reject) => {
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        }),
    });

    const rc = new RequestContext();
    rc.set('actor', { type: 'user', user_id: '00000000-0000-0000-0000-000000000099' });
    rc.set('tenant_id', TENANT);
    const ctx = { requestContext: rc } as never;

    const exec = (
      hangingTool as unknown as { execute: (i: unknown, c: unknown) => Promise<unknown> }
    ).execute;

    const t0 = Date.now();
    const settled = await exec({}, ctx).then(
      (value) => ({ ok: true, value }),
      (err: unknown) => ({ ok: false, err }),
    );
    const elapsed = Date.now() - t0;

    expect(settled.ok).toBe(false);
    if (settled.ok) throw new Error('unreachable');
    expect(settled.err).toBeInstanceOf(ToolExecutionTimeoutError);
    const err = settled.err as ToolExecutionTimeoutError;
    expect(err.toJSON()).toMatchObject({
      code: 'tool_execution_timeout',
      toolId: 'test.hanging',
      timeoutMs: 500,
    });
    expect(elapsed).toBeGreaterThanOrEqual(500);
    expect(elapsed).toBeLessThan(2_000);
  });
});
