import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

import { plannerRenderers, useResolvePlannerNotification } from './renderers';

describe('planner notification renderers', () => {
  it('registers 8 event types in sorted order', () => {
    const types = plannerRenderers.map((r) => r.eventType).sort();
    expect(types).toEqual([
      'planner.group.member.added',
      'planner.group.member.role-changed',
      'planner.plan.created',
      'planner.plan.deleted',
      'planner.task.assigned',
      'planner.task.completed',
      'planner.task.reopened',
      'planner.task.unassigned',
    ]);
  });

  it('task.assigned navigates to /planner/plans/:plan_id/tasks/:task_id on click', async () => {
    navigateMock.mockClear();
    function Probe(): React.ReactElement {
      const { icon, onClick } = useResolvePlannerNotification({
        id: 'n-1',
        event_type: 'planner.task.assigned',
        payload: { task_id: 'task-1', plan_id: 'plan-1', title: 'X' },
        created_at: '2026-05-22T00:00:00Z',
        read_at: null,
      });
      return (
        <button type="button" onClick={onClick}>
          {icon}click
        </button>
      );
    }
    const { getByRole } = render(<Probe />);
    await userEvent.click(getByRole('button'));
    expect(navigateMock).toHaveBeenCalledWith({ to: '/planner/plans/plan-1/tasks/task-1' });
  });

  it('plan.deleted navigates to /planner/groups/:group_id (plan no longer exists)', async () => {
    navigateMock.mockClear();
    function Probe(): React.ReactElement {
      const { onClick } = useResolvePlannerNotification({
        id: 'n-2',
        event_type: 'planner.plan.deleted',
        payload: { group_id: 'group-1', title: 'X' },
        created_at: '2026-05-22T00:00:00Z',
        read_at: null,
      });
      return (
        <button type="button" onClick={onClick}>
          click
        </button>
      );
    }
    const { getByRole } = render(<Probe />);
    await userEvent.click(getByRole('button'));
    expect(navigateMock).toHaveBeenCalledWith({ to: '/planner/groups/group-1' });
  });
});
