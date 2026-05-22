import { describe, expect, it } from 'vitest';
import { requiredPermissionFor } from '../../../src/backend/tools/_types.ts';
import { makeSkillMatcherFormatQueryTool } from '../../../src/backend/tools/skill-matcher/format-query.ts';
import { makeToolContext } from '../../test-helpers.ts';

const TASK_ID = '00000000-0000-4000-8000-000000000001';
const CTX = makeToolContext({ user_id: '00000000-0000-4000-8000-000000000099' });
const tool = makeSkillMatcherFormatQueryTool();

describe('skillMatcher_formatQuery tool', () => {
  it('formats a single skill correctly', async () => {
    const out = (await tool.execute!({ task_id: TASK_ID, skills: ['Terraform'] }, CTX)) as {
      query: string;
      skill_count: number;
    };

    expect(out.query).toBe('Engineer with skills in Terraform');
    expect(out.skill_count).toBe(1);
  });

  it('formats two skills with "and" separator', async () => {
    const out = (await tool.execute!(
      { task_id: TASK_ID, skills: ['Terraform', 'AWS ECS'] },
      CTX,
    )) as { query: string };

    expect(out.query).toBe('Engineer with skills in Terraform, and AWS ECS');
  });

  it('formats three or more skills with comma list and final "and"', async () => {
    const out = (await tool.execute!(
      { task_id: TASK_ID, skills: ['Terraform', 'AWS ECS', 'PostgreSQL'] },
      CTX,
    )) as { query: string; skill_count: number };

    expect(out.query).toBe('Engineer with skills in Terraform, AWS ECS, and PostgreSQL');
    expect(out.skill_count).toBe(3);
  });

  it('passes task_id through unchanged', async () => {
    const out = (await tool.execute!({ task_id: TASK_ID, skills: ['Docker'] }, CTX)) as {
      task_id: string;
    };

    expect(out.task_id).toBe(TASK_ID);
  });

  it('is registered with permission planner.task.read', () => {
    expect(requiredPermissionFor(tool)).toBe('planner.task.read');
  });
});
