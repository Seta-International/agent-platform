import { describe, expect, it } from 'vitest';
import { makeListMyThreadsTool } from '../../src/backend/tools/copilot.list-my-threads.ts';

describe('copilot.listMyThreads tool', () => {
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
    const out = (await tool.execute({ user_id: 'u1', type: 'user' }, { limit: 10 })) as {
      threads: Array<{ id: string }>;
    };
    expect(out.threads.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('requires copilot.thread.read.self', () => {
    const tool = makeListMyThreadsTool({ listThreads: async () => [] });
    expect(tool.requiredPermission).toBe('copilot.thread.read.self');
  });

  it('throws when actor is not a user', async () => {
    const tool = makeListMyThreadsTool({ listThreads: async () => [] });
    await expect(tool.execute({ user_id: null, type: 'cli' }, { limit: 20 })).rejects.toThrow();
  });
});
