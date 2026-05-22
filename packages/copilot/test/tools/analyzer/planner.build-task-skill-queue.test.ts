import { describe, expect, it, vi } from 'vitest';
import { requiredPermissionFor } from '../../../src/backend/tools/_types.ts';
import { makePlannerBuildTaskSkillQueueTool } from '../../../src/backend/tools/analyzer/planner.build-task-skill-queue.ts';
import { makeToolContext } from '../../test-helpers.ts';

const CALLER_ID = '00000000-0000-4000-8000-000000000099';
const CTX = makeToolContext({ user_id: CALLER_ID });

const ITEMS = [
  {
    task_id: '00000000-0000-4000-8000-000000000001',
    title: 'Kubernetes audit',
    skills: ['Kubernetes', 'AWS'],
  },
  { task_id: '00000000-0000-4000-8000-000000000002', title: 'Fix CVE', skills: ['Security'] },
];

const ENQUEUE_RESPONSE = {
  job_id: 'job-analyzer-001',
  queue: 'staffing:skill_matcher_dispatch',
  enqueued_at: '2026-05-21T08:00:00Z',
};

describe('planner_buildTaskSkillQueue tool', () => {
  it('calls enqueueForOrchestrator with all items and the caller as enqueuedBy', async () => {
    const enqueueForOrchestrator = vi.fn().mockResolvedValue(ENQUEUE_RESPONSE);
    const tool = makePlannerBuildTaskSkillQueueTool({ enqueueForOrchestrator });

    await tool.execute!({ items: ITEMS }, CTX);

    expect(enqueueForOrchestrator).toHaveBeenCalledWith({
      payload: ITEMS,
      enqueuedBy: CALLER_ID,
    });
  });

  it('returns job confirmation, item_count, and total_skills_extracted', async () => {
    const tool = makePlannerBuildTaskSkillQueueTool({
      enqueueForOrchestrator: vi.fn().mockResolvedValue(ENQUEUE_RESPONSE),
    });

    const out = (await tool.execute!({ items: ITEMS }, CTX)) as {
      job_id: string;
      item_count: number;
      total_skills_extracted: number;
    };

    expect(out.job_id).toBe('job-analyzer-001');
    expect(out.item_count).toBe(2);
    expect(out.total_skills_extracted).toBe(3); // 2 + 1
  });

  it('is registered with permission planner.task.read', () => {
    const tool = makePlannerBuildTaskSkillQueueTool({ enqueueForOrchestrator: vi.fn() });
    expect(requiredPermissionFor(tool)).toBe('planner.task.read');
  });
});
