import { embeddingJobs } from '@seta/copilot';
import { describe, expect, it } from 'vitest';

describe('apps/server — embedding job registration', () => {
  it('exposes embed_task and embed_user_profile from @seta/copilot public surface', () => {
    expect(Object.keys(embeddingJobs)).toEqual(
      expect.arrayContaining(['embed_task', 'embed_user_profile']),
    );
  });
});
