import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineCrossModuleReadAsTool } from '../../src/cross-module-read-as-tool.ts';

describe('defineCrossModuleReadAsTool', () => {
  it('derives session from requestContext and delegates when the permission is present', async () => {
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
    ctx.set('role_summary', { roles: ['planner.viewer'], cross_tenant_read: false });
    ctx.set('effective_permissions', new Set(['planner.task.read']));
    const result = await tool.execute?.({ userId: 'u-target' }, { requestContext: ctx } as never);
    expect(result).toEqual({ count: 3 });
    expect(calls[0]).toEqual({
      session: {
        tenant_id: 't1',
        user_id: 'u1',
        effective_permissions: new Set(['planner.task.read']),
        role_summary: { roles: ['planner.viewer'], cross_tenant_read: false },
      },
      input: { userId: 'u-target' },
    });
  });

  it('does not invoke the underlying read when the permission is absent', async () => {
    let invoked = false;
    const tool = defineCrossModuleReadAsTool({
      id: 'planner_getOpenTaskCount',
      name: 'Open Task Count',
      description: 'Count of open tasks for a user.',
      inputSchema: z.object({ userId: z.string() }),
      outputSchema: z.object({ count: z.number() }),
      rbac: 'planner.task.read',
      execute: async () => {
        invoked = true;
        return { count: 3 };
      },
    });
    const ctx = new RequestContext();
    ctx.set('actor', { type: 'user', user_id: 'u1' });
    ctx.set('tenant_id', 't1');
    ctx.set('role_summary', { roles: ['planner.viewer'], cross_tenant_read: false });
    ctx.set('effective_permissions', new Set<string>());
    await expect(
      tool.execute?.({ userId: 'u-target' }, { requestContext: ctx } as never),
    ).rejects.toThrow();
    expect(invoked).toBe(false);
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
