import { describe, expect, it } from 'vitest';
import { plannerKeys } from '../../../../../src/modules/planner/state/query-keys';

describe('plannerKeys', () => {
  it('builds stable nested key arrays', () => {
    expect(plannerKeys.all).toEqual(['planner']);
    expect(plannerKeys.groups()).toEqual(['planner', 'groups']);
    expect(plannerKeys.myGroups()).toEqual(['planner', 'groups', 'mine']);
    expect(plannerKeys.group('g1')).toEqual(['planner', 'groups', 'g1']);
    expect(plannerKeys.groupMembers('g1')).toEqual(['planner', 'groups', 'g1', 'members']);
    expect(plannerKeys.groupPlans('g1')).toEqual(['planner', 'groups', 'g1', 'plans']);
    expect(plannerKeys.plan('p1')).toEqual(['planner', 'plan', 'p1']);
    expect(plannerKeys.planLabels('p1')).toEqual(['planner', 'plan', 'p1', 'labels']);
    expect(plannerKeys.task('t1')).toEqual(['planner', 'task', 't1']);
    expect(plannerKeys.taskEvents('t1')).toEqual(['planner', 'task', 't1', 'events']);
    expect(plannerKeys.taskChecklist('t1')).toEqual(['planner', 'task', 't1', 'checklist']);
    expect(plannerKeys.planCategories('p1')).toEqual(['planner', 'plan', 'p1', 'categories']);
    expect(plannerKeys.trash()).toEqual(['planner', 'trash']);
    expect(plannerKeys.planSyncStatus('p1')).toEqual(['planner', 'plan', 'p1', 'syncStatus']);
    expect(plannerKeys.planConflicts('p1')).toEqual(['planner', 'plan', 'p1', 'conflicts']);
    expect(plannerKeys.taskSyncStatus('t1')).toEqual(['planner', 'task', 't1', 'syncStatus']);
  });

  it('planTasks serializes filters deterministically', () => {
    const a = plannerKeys.planTasks('p1', { assignee_id: 'u1', skill_tags: ['ts', 'react'] });
    const b = plannerKeys.planTasks('p1', { skill_tags: ['ts', 'react'], assignee_id: 'u1' });
    expect(a).toEqual(b);
  });

  it('myTasks key serializes filters stably regardless of insertion order', () => {
    const a = plannerKeys.myTasks({ planId: 'p1', priority: 1, due: 'this_week' });
    const b = plannerKeys.myTasks({ due: 'this_week', priority: 1, planId: 'p1' });
    expect(a).toEqual(b);
  });

  it('myTasks key omits undefined filter fields', () => {
    expect(plannerKeys.myTasks({ planId: undefined, priority: 5 })).toEqual(
      plannerKeys.myTasks({ priority: 5 }),
    );
  });

  it('planCalendarTasks nests under planCalendar for prefix invalidation', () => {
    const prefix = plannerKeys.planCalendar('p1');
    const page = plannerKeys.planCalendarTasks('p1', '2026-06-01', '2026-06-30', 2);
    expect(page.slice(0, prefix.length)).toEqual([...prefix]);
    expect(page).toEqual([...prefix, '2026-06-01', '2026-06-30', 2]);
  });
});
