import { describe, expect, it } from 'vitest';
import { requiredPermissionFor } from '../../../src/backend/tools/_types.ts';
import { skillMatcherLlmParserTool } from '../../../src/backend/tools/skill-matcher/llm-parser.ts';
import { makeToolContext } from '../../test-helpers.ts';

const TASK_ID = '00000000-0000-4000-8000-000000000001';
const CTX = makeToolContext({ user_id: '00000000-0000-4000-8000-000000000099' });

const CHUNKS = [
  {
    user_id: '00000000-0000-4000-8000-000000000001',
    text: 'Terraform, AWS, Kubernetes',
    similarity: 0.91,
  },
  { user_id: '00000000-0000-4000-8000-000000000002', text: 'Docker, CI/CD', similarity: 0.75 },
];

describe('skillMatcher_llmParser tool', () => {
  it('returns parsed candidates with correct fields', async () => {
    const out = (await skillMatcherLlmParserTool.execute!(
      {
        task_id: TASK_ID,
        chunks: CHUNKS,
        candidates: [
          {
            user_id: '00000000-0000-4000-8000-000000000001',
            name: 'Nguyen Van A',
            skills: ['Terraform', 'AWS', 'Kubernetes'],
            role: 'senior_engineer',
          },
          {
            user_id: '00000000-0000-4000-8000-000000000002',
            name: 'Tran Thi B',
            skills: ['Docker', 'CI/CD'],
            role: 'developer',
          },
        ],
      },
      CTX,
    )) as {
      task_id: string;
      candidates: { user_id: string; skills: string[] }[];
      total_candidates: number;
    };

    expect(out.task_id).toBe(TASK_ID);
    expect(out.total_candidates).toBe(2);
  });

  it('deduplicates by user_id and merges skills from duplicate entries', async () => {
    const out = (await skillMatcherLlmParserTool.execute!(
      {
        task_id: TASK_ID,
        chunks: CHUNKS,
        candidates: [
          {
            user_id: '00000000-0000-4000-8000-000000000001',
            name: 'Nguyen Van A',
            skills: ['Terraform', 'AWS'],
            role: 'senior_engineer',
          },
          {
            user_id: '00000000-0000-4000-8000-000000000001',
            name: null,
            skills: ['Kubernetes', 'Helm'],
            role: null,
          },
        ],
      },
      CTX,
    )) as {
      candidates: { user_id: string; skills: string[]; name: string | null; role: string | null }[];
      total_candidates: number;
    };

    expect(out.total_candidates).toBe(1);
    const user = out.candidates[0]!;
    expect(user.user_id).toBe('00000000-0000-4000-8000-000000000001');
    // merged skills — lowercase deduped
    expect(user.skills).toContain('terraform');
    expect(user.skills).toContain('kubernetes');
    expect(user.skills).toContain('helm');
    // first non-null name and role preserved
    expect(user.name).toBe('Nguyen Van A');
    expect(user.role).toBe('senior_engineer');
  });

  it('normalises skills to lowercase', async () => {
    const out = (await skillMatcherLlmParserTool.execute!(
      {
        task_id: TASK_ID,
        chunks: CHUNKS,
        candidates: [
          {
            user_id: '00000000-0000-4000-8000-000000000001',
            name: null,
            skills: ['Terraform', 'TERRAFORM'],
            role: null,
          },
        ],
      },
      CTX,
    )) as { candidates: { skills: string[] }[] };

    expect(out.candidates[0]!.skills).toEqual(['terraform']);
  });

  it('is registered with permission identity.user.read.any', () => {
    expect(requiredPermissionFor(skillMatcherLlmParserTool)).toBe('identity.user.read.any');
  });
});
