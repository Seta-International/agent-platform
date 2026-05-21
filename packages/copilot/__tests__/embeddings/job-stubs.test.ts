import { describe, expect, it } from 'vitest';
import { embeddingJobs } from '../../src/backend/embeddings/register-jobs.ts';

/**
 * Smoke tests for the embedding job registry.
 *
 * M3.2: embed_task is now the real handler — we only verify the registry shape here.
 *       Integration tests for the real handler live in embed-task.test.ts.
 * M3.3: embed_user_profile stub remains; will be replaced.
 */
describe('embedding job registry', () => {
  it('exposes embed_task and embed_user_profile as graphile-worker task functions', () => {
    expect(typeof embeddingJobs.embed_task).toBe('function');
    expect(typeof embeddingJobs.embed_user_profile).toBe('function');
  });

  it('embed_user_profile is a no-op that returns without throwing', async () => {
    await embeddingJobs.embed_user_profile!(
      { tenant_id: 't', user_id: 'u', event_id: 'e' },
      {} as never,
    );
  });
});
