import { describe, expect, it } from 'vitest';
import { embeddingJobs } from '../../src/backend/embeddings/register-jobs.ts';

describe('M3.1 embedding job stubs', () => {
  it('exposes embed_task and embed_user_profile as graphile-worker task functions', () => {
    expect(typeof embeddingJobs.embed_task).toBe('function');
    expect(typeof embeddingJobs.embed_user_profile).toBe('function');
  });

  it('embed_task is a no-op that returns without throwing', async () => {
    await embeddingJobs.embed_task!({ tenant_id: 't', task_id: '1', event_id: 'e' }, {} as never);
  });

  it('embed_user_profile is a no-op that returns without throwing', async () => {
    await embeddingJobs.embed_user_profile!(
      { tenant_id: 't', user_id: 'u', event_id: 'e' },
      {} as never,
    );
  });
});
