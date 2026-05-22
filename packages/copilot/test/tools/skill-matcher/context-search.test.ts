import { describe, expect, it, vi } from 'vitest';
import { requiredPermissionFor } from '../../../src/backend/tools/_types.ts';
import {
  type ChunkResult,
  makeSkillMatcherContextSearchTool,
} from '../../../src/backend/tools/skill-matcher/context-search.ts';
import { makeToolContext } from '../../test-helpers.ts';

const TASK_ID = '00000000-0000-4000-8000-000000000001';
const CALLER_ID = '00000000-0000-4000-8000-000000000099';
const CTX = makeToolContext({ user_id: CALLER_ID });

const VECTOR = [0.1, 0.2, 0.3];
const CHUNKS: ChunkResult[] = [
  {
    user_id: '00000000-0000-4000-8000-000000000001',
    text: 'Terraform, AWS, Kubernetes',
    similarity: 0.91,
  },
  { user_id: '00000000-0000-4000-8000-000000000002', text: 'Docker, CI/CD', similarity: 0.75 },
];

describe('skillMatcher_contextSearch tool', () => {
  it('embeds the query then calls searchByEmbedding with the vector', async () => {
    const embed = vi.fn().mockResolvedValue(VECTOR);
    const searchByEmbedding = vi.fn().mockResolvedValue(CHUNKS);
    const tool = makeSkillMatcherContextSearchTool({ embed, searchByEmbedding });

    await tool.execute!({ task_id: TASK_ID, query: 'Engineer with skills in Terraform' }, CTX);

    expect(embed).toHaveBeenCalledWith('Engineer with skills in Terraform');
    expect(searchByEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ vector: VECTOR, threshold: 0.3, topK: 10 }),
    );
  });

  it('returns chunks and total_found', async () => {
    const tool = makeSkillMatcherContextSearchTool({
      embed: vi.fn().mockResolvedValue(VECTOR),
      searchByEmbedding: vi.fn().mockResolvedValue(CHUNKS),
    });

    const out = (await tool.execute!(
      { task_id: TASK_ID, query: 'Engineer with skills in Terraform' },
      CTX,
    )) as { task_id: string; chunks: ChunkResult[]; total_found: number };

    expect(out.task_id).toBe(TASK_ID);
    expect(out.total_found).toBe(2);
    expect(out.chunks[0]!.similarity).toBe(0.91);
  });

  it('passes custom threshold and top_k to searchByEmbedding', async () => {
    const searchByEmbedding = vi.fn().mockResolvedValue([]);
    const tool = makeSkillMatcherContextSearchTool({
      embed: vi.fn().mockResolvedValue(VECTOR),
      searchByEmbedding,
    });

    await tool.execute!({ task_id: TASK_ID, query: 'Engineer', threshold: 0.7, top_k: 5 }, CTX);

    expect(searchByEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ threshold: 0.7, topK: 5 }),
    );
  });

  it('is registered with permission identity.user.read.any', () => {
    const tool = makeSkillMatcherContextSearchTool({
      embed: vi.fn(),
      searchByEmbedding: vi.fn(),
    });
    expect(requiredPermissionFor(tool)).toBe('identity.user.read.any');
  });
});
