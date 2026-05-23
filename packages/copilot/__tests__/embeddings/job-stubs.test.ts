import { describe, expect, it } from 'vitest';
import { embeddingJobs } from '../../src/backend/embeddings/register-jobs.ts';

describe('embedding job registry', () => {
  it('exposes embed_user_profile as a graphile-worker task function', () => {
    expect(typeof embeddingJobs.embed_user_profile).toBe('function');
  });

  it('no longer exposes knowledge jobs (those moved to @seta/knowledge)', () => {
    expect(embeddingJobs).not.toHaveProperty('parse_knowledge_file');
    expect(embeddingJobs).not.toHaveProperty('embed_knowledge_chunks');
  });
});
