import { isDeepStrictEqual } from 'node:util';
import type { PlannerSessionScope } from '@seta/planner';
import { resolveField } from '../lww.ts';
import {
  planPullConflictCounter,
  planPullErrorCounter,
  planPullSuccessCounter,
  planPullThrottledCounter,
  tasksChangedHistogram,
  tasksWalkedHistogram,
  withSpan,
} from '../observability.ts';
import { createAssigneeResolver } from '../plans/assignee-resolver.ts';
import { pullCategoryMapping } from '../plans/category-mapping.ts';
import type { PlansGraph } from '../plans/graph.ts';
import type { M365PlanLinkRepo, M365ResourceEtagRepo, ResourceEtag } from '../plans/repo.ts';
import { type KnownEtags, walk } from '../plans/walker.ts';

export interface RunPlanPullInput {
  tenant_id: string;
  plan_id: string;
  full: boolean;
}

export interface PlannerPullSurface {
  markPlanSyncStatus: (input: {
    plan_id: string;
    status: 'pulling' | 'idle' | 'error' | 'conflict';
    last_error?: string | null;
    session: PlannerSessionScope;
  }) => Promise<unknown>;
  getPlan: (input: { plan_id: string; session: PlannerSessionScope }) => Promise<{
    id: string;
    title: string;
    external_source: string;
    group_id: string;
    category_descriptions: Record<string, string | null>;
  }>;
  listBuckets: (input: {
    plan_id: string;
    session: PlannerSessionScope;
  }) => Promise<
    Array<{ id: string; name: string; order_hint: string; external_id: string | null }>
  >;
  listTasks: (input: { filters: { plan_id: string }; session: PlannerSessionScope }) => Promise<{
    tasks: Array<{
      id: string;
      bucket_id: string;
      title: string;
      external_id: string | null;
      external_etag: string | null;
    }>;
  }>;
  createBucket: (input: {
    plan_id: string;
    name: string;
    order_hint: string;
    external_source: 'm365';
    external_id: string;
    external_etag: string;
    session: PlannerSessionScope;
  }) => Promise<{ id: string }>;
  updateBucket: (input: {
    bucket_id: string;
    patch: { name?: string; order_hint?: string; external_etag?: string };
    session: PlannerSessionScope;
  }) => Promise<unknown>;
  deleteBucket: (input: { bucket_id: string; session: PlannerSessionScope }) => Promise<unknown>;
  createTask: (input: {
    plan_id: string;
    bucket_id: string;
    title: string;
    order_hint: string;
    priority: number;
    percent_complete: number;
    start_date?: string | null;
    due_date?: string | null;
    completed_at?: string | null;
    preview_type?: string;
    external_source: 'm365';
    external_id: string;
    external_etag: string;
    session: PlannerSessionScope;
  }) => Promise<{ id: string }>;
  updateTask: (input: {
    task_id: string;
    patch: {
      title?: string;
      order_hint?: string;
      priority?: number;
      percent_complete?: number;
      start_date?: string | null;
      due_date?: string | null;
      completed_at?: string | null;
      preview_type?: string;
      bucket_id?: string;
      external_etag?: string;
    };
    session: PlannerSessionScope;
  }) => Promise<unknown>;
  deleteTask: (input: {
    task_id: string;
    reason?: string;
    session: PlannerSessionScope;
  }) => Promise<unknown>;
  setTaskAssignees: (input: {
    task_id: string;
    user_ids: string[];
    session: PlannerSessionScope;
  }) => Promise<unknown>;
  updateTaskDetails: (input: {
    task_id: string;
    description?: string | null;
    preview_type?: string;
    references?: Array<{ url: string; alias?: string; type?: string }>;
    checklist?: Array<{ id?: string; title: string; checked: boolean; order_hint?: string }>;
    session: PlannerSessionScope;
  }) => Promise<unknown>;
  setCategoryDescriptions: (input: {
    plan_id: string;
    slots: Record<number, { name?: string | null; label_id?: string | null }>;
    session: PlannerSessionScope;
  }) => Promise<unknown>;
  listLabels: (input: {
    plan_id: string;
    session: PlannerSessionScope;
  }) => Promise<Array<{ id: string; name: string; category_slot: number | null }>>;
  createLabel: (input: {
    plan_id: string;
    name: string;
    color: string;
    session: PlannerSessionScope;
  }) => Promise<{ id: string }>;
  updatePlan: (input: {
    plan_id: string;
    patch: { title?: string; external_etag?: string };
    session: PlannerSessionScope;
  }) => Promise<unknown>;
  markTaskSyncStatus: (input: {
    task_id: string;
    status: 'idle' | 'conflict' | 'error';
    session: PlannerSessionScope;
  }) => Promise<unknown>;
}

export interface RunPlanPullDeps {
  graph: PlansGraph;
  planLinkRepo: M365PlanLinkRepo;
  etagRepo: M365ResourceEtagRepo;
  findUserByEntraOid: (input: {
    entra_oid: string;
    tenant_id: string;
  }) => Promise<{ user_id: string } | null>;
  emit: (event: { type: string; payload: unknown }) => void | Promise<void>;
  planner: PlannerPullSurface;
  buildSystemSession: (tenantId: string) => PlannerSessionScope;
}

function buildKnownEtags(rows: ResourceEtag[]): KnownEtags {
  const out: KnownEtags = {
    buckets: new Map(),
    tasks: new Map(),
    taskDetails: new Map(),
    boardFormats: new Map(),
  };
  for (const row of rows) {
    if (row.resourceType === 'plan') out.plan = row.etag;
    else if (row.resourceType === 'planDetails') out.planDetails = row.etag;
    else if (row.resourceType === 'bucket') out.buckets.set(row.externalId, row.etag);
    else if (row.resourceType === 'task') out.tasks.set(row.externalId, row.etag);
    else if (row.resourceType === 'taskDetails') out.taskDetails.set(row.externalId, row.etag);
    else if (row.resourceType === 'bucketTaskBoardTaskFormat')
      out.boardFormats.set(row.externalId, row.etag);
  }
  return out;
}

export async function runPlanPull(input: RunPlanPullInput, deps: RunPlanPullDeps): Promise<void> {
  return withSpan(
    'm365.plan.pull',
    { tenant_id: input.tenant_id, plan_id: input.plan_id, full: input.full },
    async () => {
      const session = deps.buildSystemSession(input.tenant_id);

      const link = await deps.planLinkRepo.findByPlan(input.plan_id);
      if (!link) throw new Error('LINK_NOT_FOUND');

      await deps.planner.markPlanSyncStatus({
        plan_id: input.plan_id,
        status: 'pulling',
        session,
      });

      try {
        const remotePlan = await deps.graph.getPlan(link.externalId);
        const remotePlanDetails = await deps.graph.getPlanDetails(link.externalId);
        const remoteBuckets = await deps.graph.listBuckets(link.externalId);
        const remoteTasks = await deps.graph.listTasks(link.externalId);

        const knownEtagRows = await deps.etagRepo.listForLink(link.id);
        const knownEtags = buildKnownEtags(knownEtagRows);

        const localPlan = await deps.planner.getPlan({ plan_id: input.plan_id, session });
        const localBuckets = await deps.planner.listBuckets({ plan_id: input.plan_id, session });
        const localTasksResult = await deps.planner.listTasks({
          filters: { plan_id: input.plan_id },
          session,
        });
        const localTasks = localTasksResult.tasks;

        const actions = walk({
          local: {
            plan: { id: localPlan.id, title: localPlan.title },
            planDetails: { categoryDescriptions: localPlan.category_descriptions },
            buckets: localBuckets.map((b) => ({
              id: b.id,
              external_id: b.external_id,
              name: b.name,
              order_hint: b.order_hint,
            })),
            tasks: localTasks.map((t) => ({
              id: t.id,
              external_id: t.external_id,
              external_etag: t.external_etag,
              title: t.title,
              bucket_id: t.bucket_id,
            })),
          },
          remote: {
            plan: remotePlan,
            planDetails: remotePlanDetails,
            buckets: remoteBuckets,
            tasks: remoteTasks,
          },
          knownEtags,
          snapshot: (link.lastSyncedSnapshot ?? {}) as Record<string, unknown>,
        });

        tasksWalkedHistogram.record(remoteTasks.length, { tenant_id: input.tenant_id });
        tasksChangedHistogram.record(actions.changedTaskExternalIds.length, {
          tenant_id: input.tenant_id,
        });

        if (actions.planFieldsToApply.title !== undefined) {
          await deps.planner.updatePlan({
            plan_id: input.plan_id,
            patch: {
              title: actions.planFieldsToApply.title,
              external_etag: remotePlan['@odata.etag'],
            },
            session,
          });
        }

        let anyConflicts = false;

        if (actions.fieldConflicts.length > 0) {
          anyConflicts = true;
          await deps.emit({
            type: 'integrations.m365.plan.field-conflict',
            payload: {
              tenant_id: input.tenant_id,
              plan_id: input.plan_id,
              conflicts: actions.fieldConflicts,
            },
          });
        }

        await deps.etagRepo.upsert({
          tenantId: input.tenant_id,
          planLinkId: link.id,
          resourceType: 'plan',
          setaId: input.plan_id,
          externalId: link.externalId,
          etag: remotePlan['@odata.etag'],
          lastSyncedFields: { title: remotePlan.title },
        });
        await deps.etagRepo.upsert({
          tenantId: input.tenant_id,
          planLinkId: link.id,
          resourceType: 'planDetails',
          setaId: input.plan_id,
          externalId: remotePlanDetails.id,
          etag: remotePlanDetails['@odata.etag'],
          lastSyncedFields: { categoryDescriptions: remotePlanDetails.categoryDescriptions ?? {} },
        });

        if (actions.categoryDescriptionsToApply) {
          await pullCategoryMapping(
            {
              planId: input.plan_id,
              planDetails: remotePlanDetails,
              localCategoryDescriptions: localPlan.category_descriptions,
              session,
            },
            {
              planner: {
                listLabels: deps.planner.listLabels,
                createLabel: deps.planner.createLabel,
                setCategoryDescriptions: deps.planner.setCategoryDescriptions,
              },
            },
          );
        }

        const localBucketByExt = new Map<string, string>();
        for (const b of localBuckets) {
          if (b.external_id) localBucketByExt.set(b.external_id, b.id);
        }

        for (const extId of actions.changedBucketExternalIds) {
          const rb = remoteBuckets.find((b) => b.id === extId);
          if (!rb) continue;
          let setaId = localBucketByExt.get(extId);
          if (!setaId) {
            const created = await deps.planner.createBucket({
              plan_id: input.plan_id,
              name: rb.name,
              order_hint: rb.orderHint,
              external_source: 'm365',
              external_id: extId,
              external_etag: rb['@odata.etag'],
              session,
            });
            setaId = created.id;
            localBucketByExt.set(extId, setaId);
          } else {
            await deps.planner.updateBucket({
              bucket_id: setaId,
              patch: {
                name: rb.name,
                order_hint: rb.orderHint,
                external_etag: rb['@odata.etag'],
              },
              session,
            });
          }
          await deps.etagRepo.upsert({
            tenantId: input.tenant_id,
            planLinkId: link.id,
            resourceType: 'bucket',
            setaId,
            externalId: extId,
            etag: rb['@odata.etag'],
            lastSyncedFields: { name: rb.name, order_hint: rb.orderHint },
          });
        }

        const localTaskByExt = new Map<string, (typeof localTasks)[number]>();
        for (const t of localTasks) {
          if (t.external_id) localTaskByExt.set(t.external_id, t);
        }

        const assigneeResolver = createAssigneeResolver({
          findUserByEntraOid: deps.findUserByEntraOid,
          emit: deps.emit,
        });

        // Tasks snapshot keyed by external task id; populated from the persisted snapshot if present.
        const snapshotTasks = ((link.lastSyncedSnapshot as Record<string, unknown> | null)?.tasks ??
          {}) as Record<string, Record<string, unknown>>;

        // Accumulates per-task snapshots to persist at the end of this pull.
        const updatedTaskSnapshots: Record<string, Record<string, unknown>> = {};

        for (const extId of actions.changedTaskExternalIds) {
          const rt = remoteTasks.find((t) => t.id === extId);
          if (!rt) continue;

          const setaBucketId = localBucketByExt.get(rt.bucketId);
          if (!setaBucketId) continue;

          const taskDetails = await deps.graph.getTaskDetails(extId);
          const boardFormat = await deps.graph.getBucketTaskBoardTaskFormat(extId);
          const assigneeOids = Object.keys(rt.assignments ?? {});
          const resolved = await assigneeResolver.resolveMany(assigneeOids, {
            tenantId: input.tenant_id,
            planId: input.plan_id,
            taskId: rt.id,
          });

          let setaTaskId: string;
          const local = localTaskByExt.get(extId);
          if (!local) {
            const created = await deps.planner.createTask({
              plan_id: input.plan_id,
              bucket_id: setaBucketId,
              title: rt.title,
              order_hint: rt.orderHint,
              priority: rt.priority,
              percent_complete: rt.percentComplete,
              start_date: rt.startDateTime ?? null,
              due_date: rt.dueDateTime ?? null,
              completed_at: rt.completedDateTime ?? null,
              preview_type: rt.previewType,
              external_source: 'm365',
              external_id: extId,
              external_etag: rt['@odata.etag'],
              session,
            });
            setaTaskId = created.id;
            await deps.planner.markTaskSyncStatus({ task_id: setaTaskId, status: 'idle', session });
          } else {
            setaTaskId = local.id;

            // Per-field LWW for existing tasks.
            // The snapshot entry for this task, if any, contains field values from the last
            // successful sync. Used as the LWW anchor.
            const snap = snapshotTasks[extId] ?? {};

            type TaskPatch = Parameters<typeof deps.planner.updateTask>[0]['patch'];
            const patch: TaskPatch = { external_etag: rt['@odata.etag'] };
            const conflicts: Array<{
              field: string;
              local: unknown;
              remote: unknown;
              snapshot: unknown;
            }> = [];

            // Resolve a field that IS returned by listTasks (title, bucket_id). We have a genuine
            // local value and can detect local edits vs the snapshot anchor.
            function resolveObservable<T>(
              field: string,
              localVal: T,
              remoteVal: T,
              applyToPatch: (v: T) => void,
            ) {
              // Synthetic-anchor: if the snapshot has no entry for this field yet (first pull), use
              // the current local value so the decision is remote-wins when remote differs from local.
              const snapshotVal: T = field in snap ? (snap[field] as T) : localVal;
              const decision = resolveField({
                local: localVal,
                remote: remoteVal,
                snapshot: snapshotVal,
              });
              if (decision.kind === 'remote-wins') {
                applyToPatch(decision.value);
              } else if (decision.kind === 'conflict') {
                conflicts.push({
                  field,
                  local: localVal,
                  remote: remoteVal,
                  snapshot: snapshotVal,
                });
              }
              // 'noop' and 'local-wins': no contribution in PR2
            }

            // Resolve a field NOT returned by listTasks (priority, percent_complete, etc.). We cannot
            // observe local edits for these fields. Always apply remote value when it differs from the
            // last synced snapshot (= remote-wins semantics without conflict detection).
            function applyUnobservable<T>(
              field: string,
              remoteVal: T,
              applyToPatch: (v: T) => void,
            ) {
              const snapshotVal: T | undefined = field in snap ? (snap[field] as T) : undefined;
              // noop when remote unchanged from last sync; remote-wins otherwise
              if (snapshotVal === undefined || !isDeepStrictEqual(remoteVal, snapshotVal)) {
                applyToPatch(remoteVal);
              }
            }

            // title: observable via listTasks
            resolveObservable('title', local.title, rt.title, (v) => {
              patch.title = v;
            });

            // Non-observable fields: apply remote when changed from snapshot
            applyUnobservable('priority', rt.priority, (v) => {
              patch.priority = v;
            });
            applyUnobservable('percent_complete', rt.percentComplete, (v) => {
              patch.percent_complete = v;
            });
            applyUnobservable('start_date', rt.startDateTime ?? null, (v) => {
              patch.start_date = v;
            });
            applyUnobservable('due_date', rt.dueDateTime ?? null, (v) => {
              patch.due_date = v;
            });
            applyUnobservable('completed_at', rt.completedDateTime ?? null, (v) => {
              patch.completed_at = v;
            });
            applyUnobservable('preview_type', rt.previewType, (v) => {
              patch.preview_type = v;
            });
            applyUnobservable('order_hint', rt.orderHint, (v) => {
              patch.order_hint = v;
            });

            // bucket_id: observable via listTasks (bucket_id is returned). Map local bucket id to
            // its external id for the LWW comparison, then resolve back to local id if remote-wins.
            const localBucketExtId = local.bucket_id
              ? ([...localBucketByExt.entries()].find(([, id]) => id === local.bucket_id)?.[0] ??
                null)
              : null;
            resolveObservable(
              'bucket_external_id',
              localBucketExtId as string | null,
              rt.bucketId,
              (v) => {
                const resolvedBucketId = v ? localBucketByExt.get(v) : undefined;
                if (resolvedBucketId) patch.bucket_id = resolvedBucketId;
              },
            );

            await deps.planner.updateTask({ task_id: setaTaskId, patch, session });

            if (conflicts.length > 0) {
              anyConflicts = true;
              await deps.emit({
                type: 'integrations.m365.task.field-conflict',
                payload: {
                  tenant_id: input.tenant_id,
                  plan_id: input.plan_id,
                  task_id: setaTaskId,
                  external_task_id: extId,
                  conflicts,
                },
              });
              await deps.planner.markTaskSyncStatus({
                task_id: setaTaskId,
                status: 'conflict',
                session,
              });
            } else {
              await deps.planner.markTaskSyncStatus({
                task_id: setaTaskId,
                status: 'idle',
                session,
              });
            }
          }

          // Persist updated remote field values into the task snapshot for the next pull.
          updatedTaskSnapshots[extId] = {
            title: rt.title,
            priority: rt.priority,
            percent_complete: rt.percentComplete,
            start_date: rt.startDateTime ?? null,
            due_date: rt.dueDateTime ?? null,
            completed_at: rt.completedDateTime ?? null,
            preview_type: rt.previewType,
            order_hint: rt.orderHint,
            bucket_external_id: rt.bucketId,
          };

          await deps.planner.setTaskAssignees({
            task_id: setaTaskId,
            user_ids: resolved.resolved.map((r) => r.user_id),
            session,
          });

          await deps.planner.updateTaskDetails({
            task_id: setaTaskId,
            description: taskDetails.description ?? null,
            preview_type: taskDetails.previewType,
            references: Object.entries(taskDetails.references ?? {}).map(([url, r]) => ({
              url: decodeURIComponent(url),
              alias: r.alias,
              type: r.type,
            })),
            checklist: Object.entries(taskDetails.checklist ?? {}).map(([id, c]) => ({
              id,
              title: c.title,
              checked: c.isChecked,
              order_hint: c.orderHint,
            })),
            session,
          });

          await deps.etagRepo.upsert({
            tenantId: input.tenant_id,
            planLinkId: link.id,
            resourceType: 'task',
            setaId: setaTaskId,
            externalId: extId,
            etag: rt['@odata.etag'],
            lastSyncedFields: { title: rt.title },
          });
          await deps.etagRepo.upsert({
            tenantId: input.tenant_id,
            planLinkId: link.id,
            resourceType: 'taskDetails',
            setaId: setaTaskId,
            externalId: taskDetails.id,
            etag: taskDetails['@odata.etag'],
            lastSyncedFields: {},
          });
          await deps.etagRepo.upsert({
            tenantId: input.tenant_id,
            planLinkId: link.id,
            resourceType: 'bucketTaskBoardTaskFormat',
            setaId: setaTaskId,
            externalId: boardFormat.id,
            etag: boardFormat['@odata.etag'],
            lastSyncedFields: { order_hint: boardFormat.orderHint },
          });
        }

        for (const extId of actions.removedTaskExternalIds) {
          const local = localTaskByExt.get(extId);
          if (local) {
            await deps.planner.deleteTask({
              task_id: local.id,
              reason: 'external_removed',
              session,
            });
            await deps.etagRepo.remove(link.id, 'task', local.id);
            await deps.etagRepo.remove(link.id, 'taskDetails', local.id);
            await deps.etagRepo.remove(link.id, 'bucketTaskBoardTaskFormat', local.id);
          }
        }

        for (const extId of actions.removedBucketExternalIds) {
          const setaId = localBucketByExt.get(extId);
          if (setaId) {
            await deps.planner.deleteBucket({ bucket_id: setaId, session });
            await deps.etagRepo.remove(link.id, 'bucket', setaId);
          }
        }

        // Merge updated task snapshots with existing ones (carry forward entries for tasks not touched
        // in this pull cycle, so LWW anchors remain stable across incremental runs).
        const mergedTaskSnapshots = { ...snapshotTasks, ...updatedTaskSnapshots };
        // Remove entries for tasks that were deleted remotely so the map stays tidy.
        for (const extId of actions.removedTaskExternalIds) {
          delete mergedTaskSnapshots[extId];
        }

        await deps.planLinkRepo.persistSnapshot(link.id, {
          plan: { title: remotePlan.title },
          categoryDescriptions: remotePlanDetails.categoryDescriptions ?? {},
          tasks: mergedTaskSnapshots,
        });

        if (anyConflicts) {
          planPullConflictCounter.add(1, { tenant_id: input.tenant_id });
        } else {
          planPullSuccessCounter.add(1, { tenant_id: input.tenant_id });
        }

        await deps.planner.markPlanSyncStatus({
          plan_id: input.plan_id,
          status: anyConflicts ? 'conflict' : 'idle',
          last_error: null,
          session,
        });
      } catch (err) {
        if ((err as { statusCode?: number }).statusCode === 429) {
          planPullThrottledCounter.add(1, { tenant_id: input.tenant_id });
        } else {
          planPullErrorCounter.add(1, { tenant_id: input.tenant_id });
        }

        await deps.planner.markPlanSyncStatus({
          plan_id: input.plan_id,
          status: 'error',
          last_error: (err as Error).message,
          session,
        });
        throw err;
      }
    },
  );
}
