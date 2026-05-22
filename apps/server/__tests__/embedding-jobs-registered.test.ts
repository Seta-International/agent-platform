import { embeddingJobs } from '@seta/copilot';
import { describe, expect, it } from 'vitest';

describe('apps/server — embedding job registration', () => {
  it('exposes embed_task, embed_user_profile, parse_knowledge_file, and embed_knowledge_chunks from @seta/copilot public surface', () => {
    expect(Object.keys(embeddingJobs)).toEqual(
      expect.arrayContaining([
        'embed_task',
        'embed_user_profile',
        'parse_knowledge_file',
        'embed_knowledge_chunks',
      ]),
    );
  });
});
