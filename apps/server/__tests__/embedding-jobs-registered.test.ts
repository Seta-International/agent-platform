import { embeddingJobs } from '@seta/copilot';
import { plannerEmbeddingJobs } from '@seta/planner';
import { describe, expect, it } from 'vitest';

describe('apps/server — embedding job registration', () => {
  it('exposes embed_user_profile, parse_knowledge_file, and embed_knowledge_chunks from @seta/copilot', () => {
    expect(Object.keys(embeddingJobs)).toEqual(
      expect.arrayContaining([
        'embed_user_profile',
        'parse_knowledge_file',
        'embed_knowledge_chunks',
      ]),
    );
    expect(embeddingJobs).not.toHaveProperty('embed_task');
  });

  it('exposes planner.embed_task from @seta/planner', () => {
    expect(typeof plannerEmbeddingJobs['planner.embed_task']).toBe('function');
  });
});
