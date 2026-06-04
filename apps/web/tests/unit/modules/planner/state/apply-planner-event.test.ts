import type { BucketRow, TaskWithAssigneesRow } from '@seta/planner';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSkippedCountersForTests,
  applyPlannerEvent,
  type StreamEvent,
} from '../../../../../src/modules/planner/state/apply-planner-event';
import { plannerKeys } from '../../../../../src/modules/planner/state/query-keys';
import {
  __resetRingForTests,
  rememberEventId,
} from '../../../../../src/modules/planner/state/recent-mutation-event-ids';
import { makeTaskWithAssignees } from '../../../../../src/modules/planner/testing/fixtures';

vi.mock('@seta/shared-ui', async () => {
  const actual = await vi.importActual<typeof import('@seta/shared-ui')>('@seta/shared-ui');
  return { ...actual, toast: vi.fn() };
});

import { toast } from '@seta/shared-ui';

function makeEvent(over: Partial<StreamEvent> = {}): StreamEvent {
  return {
    id: 'e-1',
    eventType: 'planner.group.created',
    eventVersion: 1,
    aggregateType: 'planner.group',
    aggregateId: 'g1',
    tenantId: 't1',
    occurredAt: new Date().toISOString(),
    payload: { actor: { type: 'user', user_id: 'u' }, group_id: 'g1' },
    ...over,
  };
}

function makeBucket(over: Partial<BucketRow> = {}): BucketRow {
  return {
    id: 'b1',
    tenant_id: 't',
    plan_id: 'p1',
    name: 'Todo',
    order_hint: 'a',
    external_source: 'native',
    external_id: null,
    external_etag: null,
    external_synced_at: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    deleted_at: null,
    version: 1,
    ...over,
  };
}

const PLAN = 'p1';
const tasksKey = plannerKeys.planTasks(PLAN, { plan_id: PLAN });
const bucketsKey = [...plannerKeys.plan(PLAN), 'buckets'] as const;

describe('applyPlannerEvent', () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient();
    __resetRingForTests();
    __resetSkippedCountersForTests();
    vi.mocked(toast).mockClear();
  });

  it('planner.group.created invalidates plannerKeys.groups()', () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    applyPlannerEvent(qc, makeEvent());
    expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.groups() });
  });

  it("planner.group.member.added invalidates the group's members cache", () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    applyPlannerEvent(qc, makeEvent({ eventType: 'planner.group.member.added' }));
    expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.groupMembers('g1') });
  });

  it('skips its own echo when isOwnEcho returns true', () => {
    rememberEventId('echo-1');
    const spy = vi.spyOn(qc, 'invalidateQueries');
    applyPlannerEvent(qc, makeEvent({ id: 'echo-1' }));
    expect(spy).not.toHaveBeenCalled();
  });

  describe('planner.task.moved', () => {
    it('patches bucket_id, order_hint, version without invalidating', () => {
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey, [
        makeTaskWithAssignees({ id: 't1', bucket_id: 'b1', order_hint: 'a', version: 3 }),
        makeTaskWithAssignees({ id: 't2', bucket_id: 'b1', order_hint: 'b', version: 1 }),
      ]);
      const spy = vi.spyOn(qc, 'invalidateQueries');

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-moved',
          eventType: 'planner.task.moved',
          aggregateType: 'planner.task',
          payload: {
            task_id: 't1',
            plan_id: PLAN,
            group_id: 'g1',
            before: { bucket_id: 'b1', order_hint: 'a' },
            after: { bucket_id: 'b2', order_hint: 'm' },
            version_before: 3,
            version_after: 4,
          },
        }),
      );

      const after = qc.getQueryData<TaskWithAssigneesRow[]>(tasksKey)!;
      expect(after[0]).toMatchObject({ id: 't1', bucket_id: 'b2', order_hint: 'm', version: 4 });
      expect(after[1]).toMatchObject({ id: 't2', bucket_id: 'b1', order_hint: 'b' });
      // Only the broad myTasks predicate-based invalidation should fire; no queryKey-based invalidation.
      const queryKeyCalls = spy.mock.calls.filter(
        (c) => (c[0] as { queryKey?: unknown }).queryKey !== undefined,
      );
      expect(queryKeyCalls).toHaveLength(0);
    });
  });

  describe('planner.task.created', () => {
    it('appends a task with assignees/labels/checklist_summary defaults', () => {
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey, []);
      const spy = vi.spyOn(qc, 'invalidateQueries');

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-created',
          eventType: 'planner.task.created',
          aggregateType: 'planner.task',
          payload: {
            group_id: 'g1',
            after: {
              task_id: 'tnew',
              plan_id: PLAN,
              group_id: 'g1',
              bucket_id: 'b1',
              title: 'New',
              description: null,
              priority_number: 5,
              percent_complete: 0,
              is_deferred: false,
              due_at: null,
              skill_tags: [],
              review_state: null,
              order_hint: 'a',
              created_by: 'u',
            },
          },
        }),
      );

      const after = qc.getQueryData<TaskWithAssigneesRow[]>(tasksKey)!;
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({
        id: 'tnew',
        plan_id: PLAN,
        bucket_id: 'b1',
        title: 'New',
        priority_number: 5,
        percent_complete: 0,
        is_deferred: false,
        order_hint: 'a',
        version: 1,
        assignees: [],
        labels: [],
        checklist_summary: { total: 0, checked: 0 },
        checklist_preview: [],
        reference_preview: [],
      });
      // Only the broad myTasks predicate-based invalidation should fire; no queryKey-based invalidation.
      const queryKeyCalls = spy.mock.calls.filter(
        (c) => (c[0] as { queryKey?: unknown }).queryKey !== undefined,
      );
      expect(queryKeyCalls).toHaveLength(0);
    });

    it('is idempotent (does not duplicate on replay)', () => {
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey, []);
      const ev = makeEvent({
        id: 'e-created',
        eventType: 'planner.task.created',
        aggregateType: 'planner.task',
        payload: {
          group_id: 'g1',
          after: {
            task_id: 'tnew',
            plan_id: PLAN,
            group_id: 'g1',
            bucket_id: 'b1',
            title: 'New',
            description: null,
            priority_number: 5,
            percent_complete: 0,
            is_deferred: false,
            due_at: null,
            skill_tags: [],
            review_state: null,
            order_hint: 'a',
            created_by: 'u',
          },
        },
      });
      applyPlannerEvent(qc, ev);
      applyPlannerEvent(qc, { ...ev, id: 'e-created-2' });
      expect(qc.getQueryData<TaskWithAssigneesRow[]>(tasksKey)).toHaveLength(1);
    });
  });

  describe('planner.task.updated', () => {
    it('merges after-patch into the matching task and bumps version', () => {
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey, [
        makeTaskWithAssignees({ id: 't1', title: 'Old', priority_number: 9, version: 1 }),
      ]);
      const spy = vi.spyOn(qc, 'invalidateQueries');

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-upd',
          eventType: 'planner.task.updated',
          aggregateType: 'planner.task',
          payload: {
            task_id: 't1',
            plan_id: PLAN,
            before: { title: 'Old', priority_number: 9 },
            after: { title: 'New', priority_number: 1 },
            version_after: 2,
          },
        }),
      );

      const after = qc.getQueryData<TaskWithAssigneesRow[]>(tasksKey)!;
      expect(after[0]).toMatchObject({ id: 't1', title: 'New', priority_number: 1, version: 2 });
      // Only the broad myTasks predicate-based invalidation should fire; no queryKey-based invalidation.
      const queryKeyCalls = spy.mock.calls.filter(
        (c) => (c[0] as { queryKey?: unknown }).queryKey !== undefined,
      );
      expect(queryKeyCalls).toHaveLength(0);
    });
  });

  describe('planner.task.deleted', () => {
    it('removes the task and invalidates the trash list', () => {
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey, [
        makeTaskWithAssignees({ id: 't1' }),
        makeTaskWithAssignees({ id: 't2' }),
      ]);
      const spy = vi.spyOn(qc, 'invalidateQueries');

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-del',
          eventType: 'planner.task.deleted',
          aggregateType: 'planner.task',
          payload: {
            task_id: 't1',
            plan_id: PLAN,
            version_before: 1,
            deleted_at: '2026-05-20T00:00:00Z',
          },
        }),
      );

      const after = qc.getQueryData<TaskWithAssigneesRow[]>(tasksKey)!;
      expect(after.map((t) => t.id)).toEqual(['t2']);
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.trash() });
    });
  });

  describe('planner.task.restored', () => {
    it('invalidates planTasks and trash without mutating cache', () => {
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey, [makeTaskWithAssignees({ id: 't2' })]);
      const spy = vi.spyOn(qc, 'invalidateQueries');

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-restore',
          eventType: 'planner.task.restored',
          aggregateType: 'planner.task',
          payload: { task_id: 't1', plan_id: PLAN, version_after: 2 },
        }),
      );

      // cache unchanged
      const after = qc.getQueryData<TaskWithAssigneesRow[]>(tasksKey)!;
      expect(after.map((t) => t.id)).toEqual(['t2']);
      expect(spy).toHaveBeenCalledWith({ queryKey: tasksKey });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.trash() });
    });
  });

  describe('planner.task.assigned', () => {
    it('appends a placeholder assignee and invalidates the single-task cache', () => {
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey, [
        makeTaskWithAssignees({ id: 't1', assignees: [] }),
      ]);
      const spy = vi.spyOn(qc, 'invalidateQueries');

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-assign',
          eventType: 'planner.task.assigned',
          aggregateType: 'planner.task',
          payload: { task_id: 't1', plan_id: PLAN, user_id: 'u9' },
        }),
      );

      const after = qc.getQueryData<TaskWithAssigneesRow[]>(tasksKey)!;
      expect(after[0]!.assignees).toHaveLength(1);
      expect(after[0]!.assignees[0]).toMatchObject({ user_id: 'u9', display_name: '…', email: '' });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.task('t1') });
    });

    it('is idempotent (does not duplicate on replay)', () => {
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey, [
        makeTaskWithAssignees({ id: 't1', assignees: [] }),
      ]);
      const ev = makeEvent({
        id: 'e-assign',
        eventType: 'planner.task.assigned',
        aggregateType: 'planner.task',
        payload: { task_id: 't1', plan_id: PLAN, user_id: 'u9' },
      });
      applyPlannerEvent(qc, ev);
      applyPlannerEvent(qc, { ...ev, id: 'e-assign-2' });
      const after = qc.getQueryData<TaskWithAssigneesRow[]>(tasksKey)!;
      expect(after[0]!.assignees).toHaveLength(1);
    });
  });

  describe('planner.task.unassigned', () => {
    it('removes the matching user from assignees', () => {
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey, [
        makeTaskWithAssignees({
          id: 't1',
          assignees: [
            {
              user_id: 'u9',
              display_name: 'Alice',
              email: 'a@x',
              availability_status: 'available',
              ooo_until: null,
              deactivated_at: null,
            },
          ],
        }),
      ]);

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-unassign',
          eventType: 'planner.task.unassigned',
          aggregateType: 'planner.task',
          payload: { task_id: 't1', plan_id: PLAN, user_id: 'u9' },
        }),
      );

      const after = qc.getQueryData<TaskWithAssigneesRow[]>(tasksKey)!;
      expect(after[0]!.assignees).toEqual([]);
    });
  });

  describe('planner.task.completed / reopened', () => {
    it('completed sets percent_complete=100 and bumps version', () => {
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey, [
        makeTaskWithAssignees({ id: 't1', percent_complete: 50, version: 1 }),
      ]);

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-comp',
          eventType: 'planner.task.completed',
          aggregateType: 'planner.task',
          payload: {
            task_id: 't1',
            plan_id: PLAN,
            version_after: 2,
            completed_at: '2026-05-20T00:00:00Z',
          },
        }),
      );

      const after = qc.getQueryData<TaskWithAssigneesRow[]>(tasksKey)!;
      expect(after[0]).toMatchObject({ percent_complete: 100, is_deferred: false, version: 2 });
    });

    it('reopened sets percent_complete=0 and bumps version', () => {
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey, [
        makeTaskWithAssignees({ id: 't1', percent_complete: 100, version: 2 }),
      ]);

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-reop',
          eventType: 'planner.task.reopened',
          aggregateType: 'planner.task',
          payload: { task_id: 't1', plan_id: PLAN, version_after: 3 },
        }),
      );

      const after = qc.getQueryData<TaskWithAssigneesRow[]>(tasksKey)!;
      expect(after[0]).toMatchObject({ percent_complete: 0, is_deferred: false, version: 3 });
    });
  });

  describe('planner.bucket.created', () => {
    it('appends a bucket to the buckets cache', () => {
      qc.setQueryData<BucketRow[]>(bucketsKey, [makeBucket({ id: 'b1', order_hint: 'a' })]);
      const spy = vi.spyOn(qc, 'invalidateQueries');

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-bcreate',
          eventType: 'planner.bucket.created',
          aggregateType: 'planner.bucket',
          payload: {
            group_id: 'g1',
            after: {
              bucket_id: 'b2',
              plan_id: PLAN,
              group_id: 'g1',
              name: 'Doing',
              order_hint: 'b',
            },
          },
        }),
      );

      const after = qc.getQueryData<BucketRow[]>(bucketsKey)!;
      expect(after.map((b) => b.id)).toEqual(['b1', 'b2']);
      expect(after[1]).toMatchObject({ id: 'b2', name: 'Doing', order_hint: 'b', version: 1 });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('planner.bucket.updated', () => {
    it('merges after-patch into the matching bucket and bumps version', () => {
      qc.setQueryData<BucketRow[]>(bucketsKey, [
        makeBucket({ id: 'b1', name: 'Old', order_hint: 'a', version: 1 }),
      ]);

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-bupd',
          eventType: 'planner.bucket.updated',
          aggregateType: 'planner.bucket',
          payload: {
            bucket_id: 'b1',
            plan_id: PLAN,
            before: { name: 'Old' },
            after: { name: 'New', order_hint: 'm' },
            version_after: 2,
          },
        }),
      );

      const after = qc.getQueryData<BucketRow[]>(bucketsKey)!;
      expect(after[0]).toMatchObject({ id: 'b1', name: 'New', order_hint: 'm', version: 2 });
    });
  });

  describe('planner.task.reference-added.v1', () => {
    it('invalidates task and plan', () => {
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-ref-add',
          eventType: 'planner.task.reference-added.v1',
          aggregateType: 'planner.task',
          payload: { task_id: 't1', plan_id: PLAN, url: 'https://x', alias: null, type: 'web' },
        }),
      );
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.task('t1') });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.plan(PLAN) });
    });
  });

  describe('planner.task.reference-removed.v1', () => {
    it('invalidates task and plan', () => {
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-ref-rm',
          eventType: 'planner.task.reference-removed.v1',
          aggregateType: 'planner.task',
          payload: { task_id: 't1', plan_id: PLAN, url: 'https://x' },
        }),
      );
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.task('t1') });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.plan(PLAN) });
    });
  });

  describe('planner.plan.category-description-changed.v1', () => {
    it('invalidates planCategories and plan', () => {
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-cat-desc',
          eventType: 'planner.plan.category-description-changed.v1',
          aggregateType: 'planner.plan',
          payload: { plan_id: PLAN, slot: 1, before: null, after: 'Backend' },
        }),
      );
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.planCategories(PLAN) });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.plan(PLAN) });
    });
  });

  describe('planner.label.category-slot-changed.v1', () => {
    it('invalidates planCategories and planLabels', () => {
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-label-slot',
          eventType: 'planner.label.category-slot-changed.v1',
          aggregateType: 'planner.label',
          payload: { plan_id: PLAN, label_id: 'l1', before: null, after: 2 },
        }),
      );
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.planCategories(PLAN) });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.planLabels(PLAN) });
    });
  });

  describe('planner.task.updated with new mutable fields', () => {
    it('merges percent_complete, priority_number, start_at, due_at, is_deferred, preview_type', () => {
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey, [
        makeTaskWithAssignees({
          id: 't1',
          percent_complete: 0,
          priority_number: 5,
          is_deferred: false,
          version: 1,
        }),
      ]);

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-upd-fields',
          eventType: 'planner.task.updated',
          aggregateType: 'planner.task',
          payload: {
            task_id: 't1',
            plan_id: PLAN,
            before: {
              percent_complete: 0,
              priority_number: 5,
              start_at: null,
              due_at: null,
              is_deferred: false,
              preview_type: 'automatic',
            },
            after: {
              percent_complete: 50,
              priority_number: 9,
              start_at: '2026-05-01T00:00:00Z',
              due_at: '2026-05-31T00:00:00Z',
              is_deferred: true,
              preview_type: 'checklist',
            },
            changed_fields: [
              'percent_complete',
              'priority_number',
              'start_at',
              'due_at',
              'is_deferred',
              'preview_type',
            ],
            version_after: 2,
          },
        }),
      );

      const after = qc.getQueryData<TaskWithAssigneesRow[]>(tasksKey)!;
      expect(after[0]).toMatchObject({
        id: 't1',
        percent_complete: 50,
        priority_number: 9,
        start_at: '2026-05-01T00:00:00Z',
        due_at: '2026-05-31T00:00:00Z',
        is_deferred: true,
        preview_type: 'checklist',
        version: 2,
      });
    });
  });

  describe('planner.bucket.deleted', () => {
    it('removes the bucket and invalidates tasks for the plan', () => {
      qc.setQueryData<BucketRow[]>(bucketsKey, [
        makeBucket({ id: 'b1' }),
        makeBucket({ id: 'b2' }),
      ]);
      const spy = vi.spyOn(qc, 'invalidateQueries');

      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-bdel',
          eventType: 'planner.bucket.deleted',
          aggregateType: 'planner.bucket',
          payload: {
            bucket_id: 'b1',
            plan_id: PLAN,
            version_before: 1,
            deleted_task_ids: ['t1', 't2'],
          },
        }),
      );

      const after = qc.getQueryData<BucketRow[]>(bucketsKey)!;
      expect(after.map((b) => b.id)).toEqual(['b2']);
      expect(spy).toHaveBeenCalledWith({ queryKey: tasksKey });
    });
  });

  describe('planner.plan.sync-status-changed.v1', () => {
    it('invalidates planSyncStatus and plan', () => {
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-plan-sync',
          eventType: 'planner.plan.sync-status-changed.v1',
          aggregateType: 'planner.plan',
          payload: {
            actor: { type: 'system', system_id: 'integrations.m365' },
            plan_id: PLAN,
            after_status: 'idle',
          },
        }),
      );
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.planSyncStatus(PLAN) });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.plan(PLAN) });
    });
  });

  describe('skipped-assignee toast', () => {
    function syncStatusEvent(planId: string, afterStatus: string, id = 'e-sync'): StreamEvent {
      return makeEvent({
        id,
        eventType: 'planner.plan.sync-status-changed.v1',
        aggregateType: 'planner.plan',
        payload: {
          actor: { type: 'system', system_id: 'integrations.m365' },
          plan_id: planId,
          after_status: afterStatus,
        },
      });
    }

    function skippedEvent(planId: string, taskId: string, id = 'e-skip'): StreamEvent {
      return makeEvent({
        id,
        eventType: 'integrations.m365.assignee.skipped.v1',
        aggregateType: 'planner.task',
        payload: {
          tenant_id: 't1',
          plan_id: planId,
          task_id: taskId,
          entra_oid: 'oid-1',
          reason: 'not_provisioned',
        },
      });
    }

    it('resets counter when pull starts (after_status=pulling)', () => {
      // Pre-load a count so the reset is observable
      applyPlannerEvent(qc, skippedEvent(PLAN, 't1', 'e-s1'));
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'pulling', 'e-pull'));
      // Now finishing the pull with no further skipped events — no toast expected
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'idle', 'e-idle'));
      expect(toast).not.toHaveBeenCalled();
    });

    it('accumulates 3 skipped events and fires toast when pull completes', () => {
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'pulling', 'e-pull'));
      applyPlannerEvent(qc, skippedEvent(PLAN, 't1', 'e-s1'));
      applyPlannerEvent(qc, skippedEvent(PLAN, 't2', 'e-s2'));
      applyPlannerEvent(qc, skippedEvent(PLAN, 't3', 'e-s3'));
      expect(toast).not.toHaveBeenCalled();
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'idle', 'e-idle'));
      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(
        'Synced — 3 Microsoft 365 users skipped. Ask an admin to add them here. (Settings → Users)',
      );
    });

    it('does not fire toast when counter is 0 after idle', () => {
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'pulling', 'e-pull'));
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'idle', 'e-idle'));
      expect(toast).not.toHaveBeenCalled();
    });

    it('resets counter after toast fires so a second idle does not re-fire', () => {
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'pulling', 'e-pull'));
      applyPlannerEvent(qc, skippedEvent(PLAN, 't1', 'e-s1'));
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'idle', 'e-idle1'));
      expect(toast).toHaveBeenCalledTimes(1);
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'idle', 'e-idle2'));
      expect(toast).toHaveBeenCalledTimes(1);
    });

    it('tracks skipped events for different plans independently', () => {
      const P2 = 'p2';
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'pulling', 'e-pull1'));
      applyPlannerEvent(qc, syncStatusEvent(P2, 'pulling', 'e-pull2'));
      applyPlannerEvent(qc, skippedEvent(PLAN, 't1', 'e-s1'));
      applyPlannerEvent(qc, skippedEvent(PLAN, 't2', 'e-s2'));
      applyPlannerEvent(qc, skippedEvent(P2, 't3', 'e-s3'));
      // Finish p2 first — only 1 skip
      applyPlannerEvent(qc, syncStatusEvent(P2, 'idle', 'e-idle-p2'));
      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(
        'Synced — 1 Microsoft 365 user skipped. Ask an admin to add them here. (Settings → Users)',
      );
      vi.mocked(toast).mockClear();
      // Finish p1 — 2 skips
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'idle', 'e-idle-p1'));
      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(
        'Synced — 2 Microsoft 365 users skipped. Ask an admin to add them here. (Settings → Users)',
      );
    });

    it('uses singular "user" for exactly 1 skip', () => {
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'pulling', 'e-pull'));
      applyPlannerEvent(qc, skippedEvent(PLAN, 't1', 'e-s1'));
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'idle', 'e-idle'));
      expect(toast).toHaveBeenCalledWith(
        'Synced — 1 Microsoft 365 user skipped. Ask an admin to add them here. (Settings → Users)',
      );
    });

    it('uses plural "users" for 3 skips', () => {
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'pulling', 'e-pull'));
      applyPlannerEvent(qc, skippedEvent(PLAN, 't1', 'e-s1'));
      applyPlannerEvent(qc, skippedEvent(PLAN, 't2', 'e-s2'));
      applyPlannerEvent(qc, skippedEvent(PLAN, 't3', 'e-s3'));
      applyPlannerEvent(qc, syncStatusEvent(PLAN, 'idle', 'e-idle'));
      expect(toast).toHaveBeenCalledWith(
        'Synced — 3 Microsoft 365 users skipped. Ask an admin to add them here. (Settings → Users)',
      );
    });
  });

  describe('planner.task.sync-status-changed.v1', () => {
    it('invalidates taskSyncStatus, task, and tasksKey when plan_id present', () => {
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-task-sync',
          eventType: 'planner.task.sync-status-changed.v1',
          aggregateType: 'planner.task',
          payload: {
            actor: { type: 'system', system_id: 'integrations.m365' },
            task_id: 't1',
            plan_id: PLAN,
            after_status: 'idle',
          },
        }),
      );
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.taskSyncStatus('t1') });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.task('t1') });
      expect(spy).toHaveBeenCalledWith({ queryKey: tasksKey });
    });
  });

  describe('integrations.m365.plan.field-conflict.v1', () => {
    it('invalidates planConflicts and planSyncStatus', () => {
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-plan-conflict',
          eventType: 'integrations.m365.plan.field-conflict.v1',
          aggregateType: 'planner.plan',
          payload: {
            actor: { type: 'system', system_id: 'integrations.m365' },
            plan_id: PLAN,
            field: 'title',
          },
        }),
      );
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.planConflicts(PLAN) });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.planSyncStatus(PLAN) });
    });
  });

  describe('integrations.m365.task.field-conflict.v1', () => {
    it('invalidates planConflicts, taskSyncStatus, and task', () => {
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-task-conflict',
          eventType: 'integrations.m365.task.field-conflict.v1',
          aggregateType: 'planner.task',
          payload: {
            actor: { type: 'system', system_id: 'integrations.m365' },
            plan_id: PLAN,
            task_id: 't1',
            field: 'title',
          },
        }),
      );
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.planConflicts(PLAN) });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.taskSyncStatus('t1') });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.task('t1') });
    });
  });

  describe('planner.plan.conflict-resolved.v1', () => {
    it('invalidates planConflicts, planSyncStatus, plan, and tasksKey', () => {
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({
          id: 'e-conflict-resolved',
          eventType: 'planner.plan.conflict-resolved.v1',
          aggregateType: 'planner.plan',
          payload: {
            actor: { type: 'system', system_id: 'integrations.m365' },
            plan_id: PLAN,
            resolved_field: 'title',
          },
        }),
      );
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.planConflicts(PLAN) });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.planSyncStatus(PLAN) });
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.plan(PLAN) });
      expect(spy).toHaveBeenCalledWith({ queryKey: tasksKey });
    });
  });

  describe('planner.comment.*', () => {
    it.each([
      ['planner.comment.created'],
      ['planner.comment.updated'],
      ['planner.comment.deleted'],
    ])('%s invalidates plannerKeys.taskComments(task_id)', (type) => {
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({
          eventType: type,
          aggregateType: 'planner.comment',
          payload: {
            actor: { type: 'user', user_id: 'u1' },
            comment_id: 'c1',
            task_id: 't1',
            plan_id: PLAN,
            group_id: 'g1',
          },
        }),
      );
      expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.taskComments('t1') });
    });

    it('ignores comment events without a task_id', () => {
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({
          eventType: 'planner.comment.created',
          aggregateType: 'planner.comment',
          payload: { actor: { type: 'user', user_id: 'u1' }, group_id: 'g1' },
        }),
      );
      expect(spy).not.toHaveBeenCalledWith({ queryKey: plannerKeys.taskComments('t1') });
    });
  });

  describe('myTasks invalidation on planner.task.* events', () => {
    it.each([
      ['planner.task.created'],
      ['planner.task.updated'],
      ['planner.task.deleted'],
      ['planner.task.assigned'],
      ['planner.task.unassigned'],
      ['planner.task.completed'],
      ['planner.task.reopened'],
      ['planner.task.moved'],
      ['planner.task.restored'],
    ])('%s triggers invalidation of plannerKeys.myTasks(...)', (type) => {
      qc.setQueryData(plannerKeys.myTasks({}), {
        late: [],
        dueThisWeek: [],
        inProgress: [],
        notStarted: [],
        recentlyCompleted: [],
      });
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({ eventType: type, payload: { plan_id: 'p1', task_id: 't1', user_id: 'u1' } }),
      );
      const calls = spy.mock.calls;
      const matched = calls.some((c) => {
        const arg = c[0] as {
          predicate?: (q: { queryKey: readonly unknown[] }) => boolean;
          queryKey?: readonly unknown[];
        };
        if (arg.predicate) {
          return arg.predicate({
            queryKey: plannerKeys.myTasks({}) as unknown as readonly unknown[],
          });
        }
        return false;
      });
      expect(matched).toBe(true);
    });

    it('does NOT invalidate myTasks on non-task events', () => {
      const spy = vi.spyOn(qc, 'invalidateQueries');
      applyPlannerEvent(
        qc,
        makeEvent({ eventType: 'planner.plan.updated', payload: { plan_id: 'p1' } }),
      );
      const calls = spy.mock.calls;
      const matched = calls.some((c) => {
        const arg = c[0] as {
          predicate?: (q: { queryKey: readonly unknown[] }) => boolean;
          queryKey?: readonly unknown[];
        };
        if (arg.predicate) {
          try {
            return arg.predicate({
              queryKey: plannerKeys.myTasks({}) as unknown as readonly unknown[],
            });
          } catch {
            return false;
          }
        }
        return false;
      });
      expect(matched).toBe(false);
    });
  });
});
