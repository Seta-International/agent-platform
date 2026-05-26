import { RequestContext } from '@mastra/core/request-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { __resetBreakerEmitterForTests } from '../../src/breaker-events';
import { __resetBreakersForTests } from '../../src/circuit-breaker';
import { defineCopilotTool } from '../../src/define-copilot-tool';
import { ToolExecutionTimeoutError } from '../../src/errors';
import { __resetExecutionPolicyForTests } from '../../src/execution-policy';

const TENANT_A = '00000000-0000-0000-0000-00000000000a';

function ctxFor(tenantId: string) {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: '00000000-0000-0000-0000-000000000099' });
  rc.set('tenant_id', tenantId);
  return { requestContext: rc } as never;
}

function getExecute(tool: unknown): (input: unknown, ctx: unknown) => Promise<unknown> {
  return (tool as { execute: (input: unknown, ctx: unknown) => Promise<unknown> }).execute;
}

describe('defineCopilotTool — timeout integration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    __resetBreakersForTests();
    __resetBreakerEmitterForTests();
    __resetExecutionPolicyForTests();
  });

  it('a read tool that hangs forever times out at 30s with ToolExecutionTimeoutError', async () => {
    const tool = defineCopilotTool({
      id: 'planner.searchTasksSemantic',
      name: 'Search tasks',
      description: 'Slow vector search.',
      input: z.object({ q: z.string() }),
      output: z.object({ results: z.array(z.string()) }),
      execute: async (_input, ctx) =>
        new Promise((_resolve, reject) => {
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        }),
    });
    const p = getExecute(tool)({ q: 'hi' }, ctxFor(TENANT_A));
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
    await expect(p).rejects.toMatchObject({
      code: 'tool_execution_timeout',
      toolId: 'planner.searchTasksSemantic',
      timeoutMs: 30_000,
    });
  });

  it('a write tool (needsApproval=true) uses the 60s budget', async () => {
    const tool = defineCopilotTool({
      id: 'planner.assignTask',
      name: 'Assign',
      description: 'Slow write.',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      needsApproval: true,
      execute: async (_input, ctx) =>
        new Promise((_resolve, reject) => {
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        }),
    });
    const p = getExecute(tool)({}, ctxFor(TENANT_A));
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
  });

  it('a fast tool returns its value unchanged', async () => {
    const tool = defineCopilotTool({
      id: 'identity.whoAmI',
      name: 'Who am I',
      description: 'Fast read.',
      input: z.object({}),
      output: z.object({ user_id: z.string() }),
      execute: async () => ({ user_id: '00000000-0000-0000-0000-000000000099' }),
    });
    const result = await getExecute(tool)({}, ctxFor(TENANT_A));
    expect(result).toEqual({ user_id: '00000000-0000-0000-0000-000000000099' });
  });

  it('an explicit executionTimeoutMs overrides the default', async () => {
    const tool = defineCopilotTool({
      id: 'knowledge.bulkEmbed',
      name: 'Bulk embed',
      description: 'Slow embedding.',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      executionTimeoutMs: 5_000,
      execute: async (_input, ctx) =>
        new Promise((_resolve, reject) => {
          ctx.abortSignal?.addEventListener('abort', () => reject(ctx.abortSignal!.reason), {
            once: true,
          });
        }),
    });
    const p = getExecute(tool)({}, ctxFor(TENANT_A));
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(p).rejects.toBeInstanceOf(ToolExecutionTimeoutError);
  });
});
