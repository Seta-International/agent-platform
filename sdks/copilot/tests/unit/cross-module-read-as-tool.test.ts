import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineCrossModuleReadAsTool } from '../../src/cross-module-read-as-tool.ts';

describe('defineCrossModuleReadAsTool', () => {
  it('derives session from requestContext and delegates to the underlying read', async () => {
    const inputSchema = z.object({ userId: z.string() });
    const outputSchema = z.object({ count: z.number() });
    const calls: Array<{ session: unknown; input: unknown }> = [];
    const tool = defineCrossModuleReadAsTool({
      id: 'planner_getOpenTaskCount',
      name: 'Open Task Count',
      description: 'Count of open tasks for a user.',
      inputSchema,
      outputSchema,
      rbac: 'planner.task.read',
      execute: async ({ session, input }) => {
        calls.push({ session, input });
        return { count: 3 };
      },
    });

    const ctx = new RequestContext();
    ctx.set('actor', { type: 'user', user_id: 'u1' });
    ctx.set('tenant_id', 't1');
    const result = await tool.execute?.({ userId: 'u-target' }, { requestContext: ctx } as never);
    expect(result).toEqual({ count: 3 });
    expect(calls[0]).toEqual({
      session: { tenant_id: 't1', user_id: 'u1' },
      input: { userId: 'u-target' },
    });
  });

  it('does not invoke the underlying read when actor is missing from requestContext', async () => {
    let invoked = false;
    const tool = defineCrossModuleReadAsTool({
      id: 't',
      name: 't',
      description: 't',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      rbac: 'planner.task.read',
      execute: async () => {
        invoked = true;
        return {};
      },
    });
    const ctx = new RequestContext();
    const result = (await tool.execute?.({}, { requestContext: ctx } as never)) as {
      error?: boolean;
    };
    expect(invoked).toBe(false);
    expect(result?.error).toBe(true);
  });
});
