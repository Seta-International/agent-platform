import { describe, expect, it, vi } from 'vitest';
import { requiredPermissionFor } from '../../../src/backend/tools/_types.ts';
import {
  type InProgressTask,
  makeAvaiCheckerCheckInProgressTasksTool,
} from '../../../src/backend/tools/avai-checker/check-inprogress-tasks.ts';
import { makeToolContext } from '../../test-helpers.ts';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const CALLER_ID = '00000000-0000-4000-8000-000000000099';

const TASKS: InProgressTask[] = [
  {
    id: 'task-0000-0000-0000-000000000001',
    title: 'Set up Kubernetes cluster',
    priority: 'urgent',
    due_at: '2026-06-15T00:00:00Z',
    plan_id: 'plan-0000-0000-0000-000000000001',
  },
  {
    id: 'task-0000-0000-0000-000000000002',
    title: 'Write unit tests',
    priority: 'medium',
    due_at: null,
    plan_id: 'plan-0000-0000-0000-000000000001',
  },
];

describe('avaiChecker_checkInProgressTasks tool', () => {
  it('returns in-progress tasks with correct fields', async () => {
    const tool = makeAvaiCheckerCheckInProgressTasksTool({
      getInProgressTasks: vi.fn().mockResolvedValue(TASKS),
    });

    const out = (await tool.execute!(
      { user_id: USER_ID },
      makeToolContext({ user_id: CALLER_ID }),
    )) as { user_id: string; in_progress_tasks: InProgressTask[]; task_count: number };

    expect(out.user_id).toBe(USER_ID);
    expect(out.task_count).toBe(2);
    expect(out.in_progress_tasks).toHaveLength(2);
    expect(out.in_progress_tasks[0]!.id).toBe('task-0000-0000-0000-000000000001');
    expect(out.in_progress_tasks[0]!.priority).toBe('urgent');
    expect(out.in_progress_tasks[1]!.due_at).toBeNull();
  });

  it('returns empty list when user has no in-progress tasks', async () => {
    const tool = makeAvaiCheckerCheckInProgressTasksTool({
      getInProgressTasks: vi.fn().mockResolvedValue([]),
    });

    const out = (await tool.execute!(
      { user_id: USER_ID },
      makeToolContext({ user_id: CALLER_ID }),
    )) as { task_count: number; in_progress_tasks: unknown[] };

    expect(out.task_count).toBe(0);
    expect(out.in_progress_tasks).toEqual([]);
  });

  it('passes assignee_id and progress filter to getInProgressTasks', async () => {
    const getInProgressTasks = vi.fn().mockResolvedValue([]);
    const tool = makeAvaiCheckerCheckInProgressTasksTool({ getInProgressTasks });

    await tool.execute!({ user_id: USER_ID }, makeToolContext({ user_id: CALLER_ID }));

    expect(getInProgressTasks).toHaveBeenCalledWith({
      userId: USER_ID,
      filters: { assignee_id: USER_ID, progress: 'in_progress' },
    });
  });

  it('is registered with permission planner.task.read', () => {
    const tool = makeAvaiCheckerCheckInProgressTasksTool({ getInProgressTasks: vi.fn() });
    expect(requiredPermissionFor(tool)).toBe('planner.task.read');
  });
});
