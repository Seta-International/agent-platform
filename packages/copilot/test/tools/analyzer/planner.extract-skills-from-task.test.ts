import { describe, expect, it } from 'vitest';
import { requiredPermissionFor } from '../../../src/backend/tools/_types.ts';
import { plannerExtractSkillsFromTaskTool } from '../../../src/backend/tools/analyzer/planner.extract-skills-from-task.ts';
import { makeToolContext } from '../../test-helpers.ts';

const CTX = makeToolContext({ user_id: '00000000-0000-4000-8000-000000000099' });
const TASK_ID = '00000000-0000-4000-8000-000000000001';

describe('planner_extractSkillsFromTask tool', () => {
  it('returns task_id, title, and normalised skills', async () => {
    const out = (await plannerExtractSkillsFromTaskTool.execute!(
      {
        task_id: TASK_ID,
        title: 'Migrate infra to Terraform',
        description: 'Move all AWS resources to IaC',
        skills: ['Terraform', 'AWS', 'IaC'],
      },
      CTX,
    )) as { task_id: string; title: string; skills: string[] };

    expect(out.task_id).toBe(TASK_ID);
    expect(out.title).toBe('Migrate infra to Terraform');
    expect(out.skills).toEqual(['Terraform', 'AWS', 'IaC']);
  });

  it('deduplicates skills case-insensitively while preserving first occurrence', async () => {
    const out = (await plannerExtractSkillsFromTaskTool.execute!(
      {
        task_id: TASK_ID,
        title: 'Task',
        description: null,
        skills: ['AWS', 'aws', 'AWS ECS', 'aws ecs'],
      },
      CTX,
    )) as { skills: string[] };

    expect(out.skills).toEqual(['AWS', 'AWS ECS']);
  });

  it('trims whitespace from skill strings', async () => {
    const out = (await plannerExtractSkillsFromTaskTool.execute!(
      {
        task_id: TASK_ID,
        title: 'Task',
        description: null,
        skills: ['  Terraform  ', ' Docker'],
      },
      CTX,
    )) as { skills: string[] };

    expect(out.skills).toEqual(['Terraform', 'Docker']);
  });

  it('is registered with permission planner.task.read', () => {
    expect(requiredPermissionFor(plannerExtractSkillsFromTaskTool)).toBe('planner.task.read');
  });
});
