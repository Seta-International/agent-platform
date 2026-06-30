import { knowledgeJobs } from '@seta/knowledge/jobs';
import { peopleEmbeddingJobs } from '@seta/people';
import { plannerEmbeddingJobs } from '@seta/planner';
import { describe, expect, it } from 'vitest';

describe('apps/server — embedding job registration', () => {
  it('exposes embed_person_profile from @seta/people', () => {
    expect(Object.keys(peopleEmbeddingJobs)).toEqual(['embed_person_profile']);
    expect(peopleEmbeddingJobs).not.toHaveProperty('embed_task');
    expect(peopleEmbeddingJobs).not.toHaveProperty('parse_knowledge_file');
    expect(peopleEmbeddingJobs).not.toHaveProperty('embed_knowledge_chunks');
  });

  it('exposes parse_knowledge_file and embed_knowledge_chunks from @seta/knowledge', () => {
    expect(typeof knowledgeJobs.parse_knowledge_file).toBe('function');
    expect(typeof knowledgeJobs.embed_knowledge_chunks).toBe('function');
  });

  it('exposes planner.embed_task from @seta/planner', () => {
    expect(typeof plannerEmbeddingJobs['planner.embed_task']).toBe('function');
  });
});
