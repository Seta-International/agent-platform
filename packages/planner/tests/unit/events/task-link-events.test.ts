import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  PlannerEvent,
  PlannerTaskLinkAdded,
  PlannerTaskLinkRemoved,
} from '../../../src/events/types.ts';

describe('task link events', () => {
  it('are part of the PlannerEvent union', () => {
    expectTypeOf<PlannerTaskLinkAdded>().toMatchTypeOf<PlannerEvent>();
    expectTypeOf<PlannerTaskLinkRemoved>().toMatchTypeOf<PlannerEvent>();
  });

  it('aggregate on the source task, so per-task subscribers still work', () => {
    const e: PlannerTaskLinkAdded = {
      event_type: 'planner.task.link-added',
      event_version: 1,
      aggregate_type: 'planner.task',
      aggregate_id: 'a',
      payload: {
        actor: { type: 'user', user_id: 'u' },
        tenant_id: 't',
        group_id: 'g',
        reference_id: 'l',
        source_task_id: 'a',
        target_task_id: 'b',
        source_plan_id: 'p1',
        target_plan_id: 'p2',
        kind: 'duplicates',
      },
    };
    expect(e.aggregate_id).toBe(e.payload.source_task_id);
  });
});
