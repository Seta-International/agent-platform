import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  checklistItems,
  groupJoinRequests,
  groupMembers,
  labels,
  planCategories,
  taskComments,
  taskLabels,
  tasks,
} from '../../src/backend/db/schema.ts';

describe('planner schema constitution', () => {
  it('child tables carry tenant_id', () => {
    for (const t of [checklistItems, taskLabels, groupMembers, groupJoinRequests]) {
      expect(getTableConfig(t).columns.some((c) => c.name === 'tenant_id')).toBe(true);
    }
  });

  it('tasks use enum progress/priority, not magic ints', () => {
    const cols = getTableConfig(tasks).columns.map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['progress', 'priority']));
    expect(cols).not.toContain('percent_complete');
    expect(cols).not.toContain('priority_number');
  });

  it('plan_categories replaces the jsonb repeating group', () => {
    expect(getTableConfig(planCategories).name).toBe('plan_categories');
  });

  it('labels are unique per plan and comments use updated_at', () => {
    const labelCfg = getTableConfig(labels);
    expect(labelCfg.indexes.some((i) => i.config.name === 'labels_uniq_name_per_plan')).toBe(true);
    expect(getTableConfig(taskComments).columns.map((c) => c.name)).toContain('updated_at');
  });

  it('tasks.plan_id is a real FK', () => {
    expect(getTableConfig(tasks).foreignKeys.length).toBeGreaterThan(0);
  });
});
