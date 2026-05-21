import { describe, expect, it } from 'vitest';
import { plannerKeys } from './query-keys';

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
  });

  it('planTasks serializes filters deterministically', () => {
    const a = plannerKeys.planTasks('p1', { assignee_id: 'u1', skill_tags: ['ts', 'react'] });
    const b = plannerKeys.planTasks('p1', { skill_tags: ['ts', 'react'], assignee_id: 'u1' });
    expect(a).toEqual(b);
  });
});
