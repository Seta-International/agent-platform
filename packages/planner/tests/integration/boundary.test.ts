import { describe, expect, it } from 'vitest';
import * as planner from '../../src/index.ts';

describe('planner public surface — native parity', () => {
  it('exports all new ops as functions', () => {
    for (const k of [
      'updateTask',
      'moveTask',
      'moveBucket',
      'addTaskReference',
      'removeTaskReference',
      'setTaskAssignees',
      'setAssigneePriority',
      'setCategoryDescription',
      'setCategoryDescriptions',
      'attachLabelToCategorySlot',
      'listMyTasks',
      'listPlanTasksByDateRange',
      'getPlanChartData',
    ] as const) {
      expect(planner).toHaveProperty(k);
      expect(typeof (planner as Record<string, unknown>)[k]).toBe('function');
    }
  });

  it('does not export the removed reorderBucket op', () => {
    expect(planner).not.toHaveProperty('reorderBucket');
  });
});
