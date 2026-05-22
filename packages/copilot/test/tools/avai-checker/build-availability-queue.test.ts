import { describe, expect, it, vi } from 'vitest';
import { requiredPermissionFor } from '../../../src/backend/tools/_types.ts';
import { makeAvaiCheckerBuildAvailabilityQueueTool } from '../../../src/backend/tools/avai-checker/build-availability-queue.ts';
import { makeToolContext } from '../../test-helpers.ts';

const CALLER_ID = '00000000-0000-4000-8000-000000000099';
const CTX = makeToolContext({ user_id: CALLER_ID });

const RESULTS = [
  {
    user_id: '00000000-0000-4000-8000-000000000001',
    name: 'Nguyen Van A',
    status: 'available' as const,
    in_progress_tasks: [],
  },
  {
    user_id: '00000000-0000-4000-8000-000000000002',
    name: 'Tran Thi B',
    status: 'busy' as const,
    in_progress_tasks: [{ task_id: 'task-abc', priority: 'medium' as const }],
  },
];

const ENQUEUE_RESPONSE = {
  job_id: 'job-001',
  queue: 'staffing:avai_checker_done',
  enqueued_at: '2026-05-21T10:00:00Z',
};

describe('avaiChecker_buildAvailabilityQueue tool', () => {
  it('calls enqueueForOrchestrator with the results and enqueuedBy', async () => {
    const enqueueForOrchestrator = vi.fn().mockResolvedValue(ENQUEUE_RESPONSE);
    const tool = makeAvaiCheckerBuildAvailabilityQueueTool({ enqueueForOrchestrator });

    await tool.execute!({ results: RESULTS }, CTX);

    expect(enqueueForOrchestrator).toHaveBeenCalledWith({
      results: RESULTS,
      enqueuedBy: CALLER_ID,
    });
  });

  it('returns job confirmation and user_count from enqueue response', async () => {
    const tool = makeAvaiCheckerBuildAvailabilityQueueTool({
      enqueueForOrchestrator: vi.fn().mockResolvedValue(ENQUEUE_RESPONSE),
    });

    const out = (await tool.execute!({ results: RESULTS }, CTX)) as {
      job_id: string;
      queue: string;
      enqueued_at: string;
      user_count: number;
      payload: typeof RESULTS;
    };

    expect(out.job_id).toBe('job-001');
    expect(out.queue).toBe('staffing:avai_checker_done');
    expect(out.user_count).toBe(2);
  });

  it('echoes the payload back in correct order', async () => {
    const tool = makeAvaiCheckerBuildAvailabilityQueueTool({
      enqueueForOrchestrator: vi.fn().mockResolvedValue(ENQUEUE_RESPONSE),
    });

    const out = (await tool.execute!({ results: RESULTS }, CTX)) as {
      payload: { user_id: string }[];
    };

    expect(out.payload.map((u) => u.user_id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ]);
  });

  it('is registered with permission planner.task.read', () => {
    const tool = makeAvaiCheckerBuildAvailabilityQueueTool({ enqueueForOrchestrator: vi.fn() });
    expect(requiredPermissionFor(tool)).toBe('planner.task.read');
  });
});
