import { describe, expect, it } from 'vitest';
import { embeddingJobs } from '../../src/backend/embeddings/register-jobs.ts';

/**
 * Smoke tests for the embedding job registry.
 *
 * embed_task and embed_user_profile are real handlers — integration tests live
 * in embed-task.test.ts and embed-user-profile.test.ts respectively.
 */
describe('embedding job registry', () => {
  it('exposes embed_task and embed_user_profile as graphile-worker task functions', () => {
    expect(typeof embeddingJobs.embed_task).toBe('function');
    expect(typeof embeddingJobs.embed_user_profile).toBe('function');
  });

  it('exposes parse_knowledge_file as a graphile-worker task function', () => {
    expect(typeof embeddingJobs.parse_knowledge_file).toBe('function');
  });

  it('exposes embed_knowledge_chunks as a graphile-worker task function', () => {
    expect(typeof embeddingJobs.embed_knowledge_chunks).toBe('function');
  });
});
