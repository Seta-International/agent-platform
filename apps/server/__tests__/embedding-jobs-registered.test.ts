import { embeddingJobs } from '@seta/copilot';
import { knowledgeJobs } from '@seta/knowledge/jobs';
import { plannerEmbeddingJobs } from '@seta/planner';
import { describe, expect, it } from 'vitest';

describe('apps/server — embedding job registration', () => {
  it('exposes embed_user_profile from @seta/copilot', () => {
    expect(Object.keys(embeddingJobs)).toEqual(['embed_user_profile']);
    expect(embeddingJobs).not.toHaveProperty('embed_task');
    expect(embeddingJobs).not.toHaveProperty('parse_knowledge_file');
    expect(embeddingJobs).not.toHaveProperty('embed_knowledge_chunks');
  });

  it('exposes parse_knowledge_file and embed_knowledge_chunks from @seta/knowledge', () => {
    expect(typeof knowledgeJobs.parse_knowledge_file).toBe('function');
    expect(typeof knowledgeJobs.embed_knowledge_chunks).toBe('function');
  });

  it('exposes planner.embed_task from @seta/planner', () => {
    expect(typeof plannerEmbeddingJobs['planner.embed_task']).toBe('function');
  });
});
