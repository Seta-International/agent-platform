import { describe, expect, it } from 'vitest';
import { requiredPermissionFor } from '../../../src/backend/tools/_types.ts';
import { avaiCheckerRankByAvailabilityTool } from '../../../src/backend/tools/avai-checker/rank-by-availability.ts';
import { makeToolContext } from '../../test-helpers.ts';

const CTX = makeToolContext({ user_id: '00000000-0000-4000-8000-000000000099' });

const makeUser = (
  id: string,
  tasks: {
    id: string;
    priority: 'urgent' | 'important' | 'medium' | 'low';
    due_at: string | null;
  }[] = [],
) => ({
  user_id: id,
  name: `User ${id}`,
  status: 'available' as const,
  in_progress_tasks: tasks.map((t) => ({ ...t, title: 'Task' })),
});

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const U3 = '00000000-0000-4000-8000-000000000003';

describe('avaiChecker_rankByAvailability tool', () => {
  it('reorders users according to ranked_order', async () => {
    const users = [makeUser(U1), makeUser(U2), makeUser(U3)];

    const out = (await avaiCheckerRankByAvailabilityTool.execute!(
      { users, ranked_order: [U3, U1, U2] },
      CTX,
    )) as { ranked_users: { user_id: string }[]; total: number };

    expect(out.ranked_users.map((u) => u.user_id)).toEqual([U3, U1, U2]);
    expect(out.total).toBe(3);
  });

  it('maps in_progress_tasks to { task_id, priority } in output', async () => {
    const users = [
      makeUser(U1, [{ id: 'task-abc', priority: 'urgent', due_at: '2026-06-01T00:00:00Z' }]),
    ];

    const out = (await avaiCheckerRankByAvailabilityTool.execute!(
      { users, ranked_order: [U1] },
      CTX,
    )) as { ranked_users: { in_progress_tasks: { task_id: string; priority: string }[] }[] };

    const tasks = out.ranked_users[0]!.in_progress_tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual({ task_id: 'task-abc', priority: 'urgent' });
    // title and due_at are NOT in the output
    expect((tasks[0] as Record<string, unknown>).title).toBeUndefined();
    expect((tasks[0] as Record<string, unknown>).due_at).toBeUndefined();
  });

  it('appends users omitted from ranked_order as a safety net', async () => {
    const users = [makeUser(U1), makeUser(U2), makeUser(U3)];

    const out = (await avaiCheckerRankByAvailabilityTool.execute!(
      { users, ranked_order: [U2] }, // U1 and U3 omitted
      CTX,
    )) as { ranked_users: { user_id: string }[] };

    expect(out.ranked_users[0]!.user_id).toBe(U2);
    // U1 and U3 appended — order among them follows input array order
    const remaining = out.ranked_users.slice(1).map((u) => u.user_id);
    expect(remaining).toContain(U1);
    expect(remaining).toContain(U3);
  });

  it('skips unknown user_ids in ranked_order', async () => {
    const users = [makeUser(U1)];
    const UNKNOWN = '00000000-0000-4000-8000-000000000099';

    const out = (await avaiCheckerRankByAvailabilityTool.execute!(
      { users, ranked_order: [UNKNOWN, U1] },
      CTX,
    )) as { ranked_users: { user_id: string }[]; total: number };

    expect(out.ranked_users.map((u) => u.user_id)).toEqual([U1]);
    expect(out.total).toBe(1);
  });

  it('does not duplicate a user_id that appears twice in ranked_order', async () => {
    const users = [makeUser(U1), makeUser(U2)];

    const out = (await avaiCheckerRankByAvailabilityTool.execute!(
      { users, ranked_order: [U1, U1, U2] },
      CTX,
    )) as { ranked_users: { user_id: string }[] };

    expect(out.ranked_users.map((u) => u.user_id)).toEqual([U1, U2]);
  });

  it('is registered with permission planner.task.read', () => {
    expect(requiredPermissionFor(avaiCheckerRankByAvailabilityTool)).toBe('planner.task.read');
  });
});
