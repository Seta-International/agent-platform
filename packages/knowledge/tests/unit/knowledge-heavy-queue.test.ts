import type { JobHelpers } from 'graphile-worker';
import { describe, expect, it, vi } from 'vitest';
import { enqueueHeavy, KNOWLEDGE_HEAVY_QUEUE } from '../../src/backend/jobs/index.ts';

describe('knowledge heavy-queue routing', () => {
  it('enqueues onto the dedicated serial queue', async () => {
    const addJob = vi.fn().mockResolvedValue(undefined);
    const helpers = { addJob } as unknown as JobHelpers;

    await enqueueHeavy(helpers, 'parse_knowledge_file', { tenant_id: 't', file_id: 'f' });

    expect(KNOWLEDGE_HEAVY_QUEUE).toBe('knowledge-heavy');
    expect(addJob).toHaveBeenCalledWith(
      'parse_knowledge_file',
      { tenant_id: 't', file_id: 'f' },
      { queueName: 'knowledge-heavy' },
    );
  });
});
