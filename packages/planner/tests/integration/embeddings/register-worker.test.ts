import { describe, expect, it } from 'vitest';
import { plannerEmbeddingJobs } from '../../../src/embeddings/register-worker.ts';

describe('plannerEmbeddingJobs', () => {
  it('exposes planner.embed_task as a function', () => {
    expect(typeof plannerEmbeddingJobs['planner.embed_task']).toBe('function');
  });

  it('exports only planner-owned job keys', () => {
    expect(Object.keys(plannerEmbeddingJobs)).toEqual(['planner.embed_task']);
  });
});
