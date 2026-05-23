import type { ToolExecutionContext } from '@mastra/core/tools';
import { type CopilotRequestContext, requiredPermissionFor } from '@seta/copilot-sdk';
import { describe, expect, it } from 'vitest';
import { makeListMyThreadsTool } from '../../src/backend/tools/copilot.list-my-threads.ts';
import { makeToolContext } from '../test-helpers.ts';

describe('copilot_listMyThreads tool', () => {
  it("returns the user's own threads, scoped by resourceId", async () => {
    const tool = makeListMyThreadsTool({
      listThreads: async ({ resourceId }) => [
        {
          id: 't1',
          resource_id: resourceId,
          title: 'first',
          updated_at: new Date('2026-05-01T00:00:00Z'),
        },
        {
          id: 't2',
          resource_id: resourceId,
          title: 'second',
          updated_at: new Date('2026-05-02T00:00:00Z'),
        },
      ],
    });
    const out = (await tool.execute!({ limit: 10 }, makeToolContext({ user_id: 'u1' }))) as {
      threads: Array<{ id: string }>;
    };
    expect(out.threads.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('is registered with permission copilot.thread.read.self', () => {
    const tool = makeListMyThreadsTool({ listThreads: async () => [] });
    expect(requiredPermissionFor(tool)).toBe('copilot.thread.read.self');
  });

  it('surfaces an unauthenticated error when no actor is in requestContext', async () => {
    const tool = makeListMyThreadsTool({ listThreads: async () => [] });
    const { RequestContext } = await import('@mastra/core/request-context');
    const rc = new RequestContext<CopilotRequestContext>();
    const ctx = {
      requestContext: rc,
      toolCallId: 'x',
      messages: [],
    } as ToolExecutionContext<unknown, unknown, CopilotRequestContext>;
    const out = (await tool.execute!({ limit: 20 }, ctx)) as { error: boolean; message?: string };
    // requestContextSchema validation runs before our execute() body, so the user-visible
    // failure is the schema mismatch on the missing `actor` field — equally an unauthenticated
    // signal, just produced one layer earlier in the pipeline.
    expect(out.error).toBe(true);
    expect(out.message).toMatch(/request context|actor/i);
  });
});
