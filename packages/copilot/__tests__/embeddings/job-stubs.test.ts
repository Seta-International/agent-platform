import { describe, expect, it } from 'vitest';
import { embeddingJobs } from '../../src/backend/embeddings/register-jobs.ts';

describe('embedding job registry', () => {
  it('exposes embed_user_profile as a graphile-worker task function', () => {
    expect(typeof embeddingJobs.embed_user_profile).toBe('function');
  });

  it('exposes parse_knowledge_file as a graphile-worker task function', () => {
    expect(typeof embeddingJobs.parse_knowledge_file).toBe('function');
  });

  it('exposes embed_knowledge_chunks as a graphile-worker task function', () => {
    expect(typeof embeddingJobs.embed_knowledge_chunks).toBe('function');
  });
});
