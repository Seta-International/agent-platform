import type { PlannerSessionScope } from '@seta/planner';
import {
  planPushConflictCounter,
  planPushErrorCounter,
  planPushPreconditionRetryCounter,
  planPushSuccessCounter,
  withSpan,
} from '../observability.ts';
import { mapPlanner403 } from '../plans/error-mapping.ts';
import type { PlansGraphWrite } from '../plans/graph.ts';
import {
  type BuildResult,
  buildBucketPatch,
  buildBucketTaskBoardTaskFormatPatch,
  buildPlanDetailsPatch,
  buildPlanPatch,
  buildTaskDetailsPatch,
  buildTaskPatch,
  type FieldConflict,
  type GraphTaskDetailsPatchable,
  type GraphTaskPatchable,
} from '../plans/push-builders.ts';
import type { M365PlanLinkRepo, M365ResourceEtagRepo, ResourceType } from '../plans/repo.ts';

const MAX_412_RETRIES = 3;

export interface RunPlanPushInput {
  tenant_id: string;
  plan_id: string;
  resource_type: ResourceType;
  seta_id: string;
  changed_fields: string[];
}

// Read-side surface the dispatcher uses to fetch current Seta state for the
// resource it's about to push. Each method returns values already shaped like
// the Graph DTO (translation lives in the adapter, not the dispatcher).
export interface PlannerPushSurface {
  markPlanSyncStatus(input: {
    plan_id: string;
    status: 'idle' | 'pushing' | 'error' | 'conflict';
    last_error?: string | null;
    session: PlannerSessionScope;
  }): Promise<unknown>;
  markTaskSyncStatus(input: {
    task_id: string;
    status: 'idle' | 'conflict' | 'error';
    session: PlannerSessionScope;
  }): Promise<unknown>;
  updatePlan(input: {
    plan_id: string;
    patch: { external_etag?: string; external_synced_at?: string };
    session: PlannerSessionScope;
  }): Promise<unknown>;
  updateBucket(input: {
    bucket_id: string;
    patch: { external_etag?: string; external_synced_at?: string; order_hint?: string };
    session: PlannerSessionScope;
  }): Promise<unknown>;
  updateTask(input: {
    task_id: string;
    patch: { external_etag?: string; external_synced_at?: string; order_hint?: string };
    session: PlannerSessionScope;
  }): Promise<unknown>;

  // Graph-shape reads. Caller passes the local-resource id (e.g. planId, taskId).
  readPlan(input: { plan_id: string; session: PlannerSessionScope }): Promise<{ title: string }>;
  readPlanDetails(input: {
    plan_id: string;
    session: PlannerSessionScope;
  }): Promise<{ categoryDescriptions: Record<string, string | null> }>;
  readBucket(input: {
    bucket_id: string;
    session: PlannerSessionScope;
  }): Promise<{ name: string; orderHint: string }>;
  readTask(input: { task_id: string; session: PlannerSessionScope }): Promise<GraphTaskPatchable>;
  readTaskDetails(input: {
    task_id: string;
    session: PlannerSessionScope;
  }): Promise<GraphTaskDetailsPatchable>;
  readTaskOrderHint(input: {
    task_id: string;
    session: PlannerSessionScope;
  }): Promise<{ orderHint: string }>;
}

export interface RunPlanPushDeps {
  graph: PlansGraphWrite;
  planLinkRepo: M365PlanLinkRepo;
  etagRepo: M365ResourceEtagRepo;
  emit(event: { type: string; payload: unknown }): Promise<void>;
  planner: PlannerPushSurface;
  buildSystemSession(tenantId: string): PlannerSessionScope;
}

interface PatchAttemptResult<T> {
  status: 'ok' | 'conflict' | 'noop';
  object?: T;
  etag?: string;
  conflicts?: FieldConflict[];
}

async function patchWithRetry<T>(
  initialEtag: string,
  build: (remote: T | null) => BuildResult,
  doPatch: (body: Record<string, unknown>, etag: string) => Promise<{ object: T; etag: string }>,
  refresh: () => Promise<{ object: T; etag: string }>,
  tenantId: string,
): Promise<PatchAttemptResult<T>> {
  let etag = initialEtag;
  let attempt = 0;
  const firstBuild = build(null);
  if (firstBuild.conflicts.length > 0) {
    return { status: 'conflict', conflicts: firstBuild.conflicts };
  }
  if (Object.keys(firstBuild.body).length === 0) {
    return { status: 'noop' };
  }

  let currentBody = firstBuild.body;
  while (attempt < MAX_412_RETRIES) {
    try {
      const r = await doPatch(currentBody, etag);
      return { status: 'ok', object: r.object, etag: r.etag };
    } catch (e: unknown) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status !== 412) throw e;
      planPushPreconditionRetryCounter.add(1, { tenant_id: tenantId });
      const fresh = await refresh();
      etag = fresh.etag;
      const rebuild = build(fresh.object);
      if (rebuild.conflicts.length > 0) {
        return { status: 'conflict', conflicts: rebuild.conflicts };
      }
      if (Object.keys(rebuild.body).length === 0) {
        return { status: 'noop' };
      }
      currentBody = rebuild.body;
      attempt++;
    }
  }
  throw new Error('m365.plan.push: 412 retry cap exceeded');
}

function snapshotPlan(snap: unknown): { title: string } {
  const s = (snap ?? {}) as { title?: string };
  return { title: s.title ?? '' };
}

function snapshotPlanDetails(snap: unknown): {
  categoryDescriptions: Record<string, string | null>;
} {
  const s = (snap ?? {}) as { categoryDescriptions?: Record<string, string | null> };
  return { categoryDescriptions: s.categoryDescriptions ?? {} };
}

function snapshotBucket(snap: unknown): { name: string; orderHint: string } {
  const s = (snap ?? {}) as { name?: string; orderHint?: string; order_hint?: string };
  return { name: s.name ?? '', orderHint: s.orderHint ?? s.order_hint ?? '' };
}

function snapshotTask(snap: unknown): GraphTaskPatchable {
  const s = (snap ?? {}) as Partial<GraphTaskPatchable>;
  return {
    title: s.title ?? '',
    dueDateTime: s.dueDateTime ?? null,
    startDateTime: s.startDateTime ?? null,
    priority: s.priority ?? 5,
    percentComplete: s.percentComplete ?? 0,
    bucketId: s.bucketId ?? '',
    assigneePriority: s.assigneePriority,
    appliedCategories: s.appliedCategories ?? {},
    assignments: s.assignments ?? {},
    conversationThreadId: s.conversationThreadId ?? null,
  };
}

function snapshotTaskDetails(snap: unknown): GraphTaskDetailsPatchable {
  const s = (snap ?? {}) as Partial<GraphTaskDetailsPatchable>;
  return {
    description: s.description ?? null,
    previewType: s.previewType,
    checklist: s.checklist ?? {},
    references: s.references ?? {},
  };
}

function snapshotBoardFormat(snap: unknown): { orderHint: string } {
  const s = (snap ?? {}) as { orderHint?: string; order_hint?: string };
  return { orderHint: s.orderHint ?? s.order_hint ?? '' };
}

async function emitFieldConflict(
  deps: RunPlanPushDeps,
  input: RunPlanPushInput,
  conflicts: FieldConflict[],
): Promise<void> {
  const eventType =
    input.resource_type === 'task' ||
    input.resource_type === 'taskDetails' ||
    input.resource_type === 'bucketTaskBoardTaskFormat'
      ? 'integrations.m365.task.field-conflict'
      : 'integrations.m365.plan.field-conflict';
  await deps.emit({
    type: eventType,
    payload: {
      tenant_id: input.tenant_id,
      plan_id: input.plan_id,
      resource_type: input.resource_type,
      seta_id: input.seta_id,
      conflicts,
    },
  });
}

export async function runPlanPush(input: RunPlanPushInput, deps: RunPlanPushDeps): Promise<void> {
  return withSpan(
    'm365.plan.push',
    {
      tenant_id: input.tenant_id,
      plan_id: input.plan_id,
      resource_type: input.resource_type,
    },
    async () => {
      const session = deps.buildSystemSession(input.tenant_id);

      const link = await deps.planLinkRepo.findByPlan(input.plan_id);
      if (!link) return; // no-op: plan was unlinked between enqueue and run

      await deps.planner.markPlanSyncStatus({
        plan_id: input.plan_id,
        status: 'pushing',
        session,
      });

      try {
        const outcome = await dispatch(input, deps, link, session);
        if (outcome === 'conflict') {
          // dispatch already emitted + marked status='conflict'; leave it.
          return;
        }
        planPushSuccessCounter.add(1, {
          tenant_id: input.tenant_id,
          resource_type: input.resource_type,
        });
        await deps.planner.markPlanSyncStatus({
          plan_id: input.plan_id,
          status: 'idle',
          last_error: null,
          session,
        });
      } catch (e: unknown) {
        const human = mapPlanner403(e);
        if (human) {
          planPushErrorCounter.add(1, {
            tenant_id: input.tenant_id,
            resource_type: input.resource_type,
          });
          await deps.planner.markPlanSyncStatus({
            plan_id: input.plan_id,
            status: 'error',
            last_error: human,
            session,
          });
          return;
        }
        planPushErrorCounter.add(1, {
          tenant_id: input.tenant_id,
          resource_type: input.resource_type,
        });
        await deps.planner.markPlanSyncStatus({
          plan_id: input.plan_id,
          status: 'error',
          last_error: (e as Error).message ?? 'push failed',
          session,
        });
        throw e;
      }
    },
  );
}

type DispatchOutcome = 'ok' | 'conflict';

async function dispatch(
  input: RunPlanPushInput,
  deps: RunPlanPushDeps,
  link: { id: string; externalId: string },
  session: PlannerSessionScope,
): Promise<DispatchOutcome> {
  switch (input.resource_type) {
    case 'plan':
      return runPlanResource(input, deps, link, session);
    case 'planDetails':
      return runPlanDetails(input, deps, link, session);
    case 'bucket':
      return runBucket(input, deps, link, session);
    case 'task':
      return runTask(input, deps, link, session);
    case 'taskDetails':
      return runTaskDetails(input, deps, link, session);
    case 'bucketTaskBoardTaskFormat':
      return runBoardFormat(input, deps, link, session);
    case 'assignment':
      return 'ok';
  }
}

async function loadEtag(
  deps: RunPlanPushDeps,
  link: { id: string },
  resourceType: ResourceType,
  setaId: string,
): Promise<{ externalId: string; etag: string; lastSyncedFields: unknown } | null> {
  const row = await deps.etagRepo.get(link.id, resourceType, setaId);
  if (!row) return null;
  return {
    externalId: row.externalId,
    etag: row.etag,
    lastSyncedFields: row.lastSyncedFields,
  };
}

async function maybeEmitConflict(
  deps: RunPlanPushDeps,
  input: RunPlanPushInput,
  conflicts: FieldConflict[],
  session: PlannerSessionScope,
  taskId?: string,
): Promise<void> {
  await emitFieldConflict(deps, input, conflicts);
  planPushConflictCounter.add(1, {
    tenant_id: input.tenant_id,
    resource_type: input.resource_type,
  });
  if (taskId) {
    await deps.planner.markTaskSyncStatus({ task_id: taskId, status: 'conflict', session });
  }
  await deps.planner.markPlanSyncStatus({
    plan_id: input.plan_id,
    status: 'conflict',
    session,
  });
}

async function runPlanResource(
  input: RunPlanPushInput,
  deps: RunPlanPushDeps,
  link: { id: string; externalId: string },
  session: PlannerSessionScope,
): Promise<DispatchOutcome> {
  const etagRow = await loadEtag(deps, link, 'plan', input.seta_id);
  if (!etagRow) return 'ok';
  const local = await deps.planner.readPlan({ plan_id: input.seta_id, session });
  const snapshot = snapshotPlan(etagRow.lastSyncedFields);

  const result = await patchWithRetry(
    etagRow.etag,
    (remote) =>
      buildPlanPatch({
        local,
        snapshot,
        remote: remote ? { title: remote.title } : undefined,
        changedFields: input.changed_fields,
      }),
    (body, etag) => deps.graph.patchPlan(etagRow.externalId, body, etag),
    () =>
      deps.graph.getPlan(etagRow.externalId).then((object) => ({
        object,
        etag: object['@odata.etag'],
      })),
    input.tenant_id,
  );

  if (result.status === 'conflict') {
    await maybeEmitConflict(deps, input, result.conflicts ?? [], session);
    return 'conflict';
  }
  if (result.status === 'noop' || !result.object || !result.etag) return 'ok';

  await deps.etagRepo.upsert({
    tenantId: input.tenant_id,
    planLinkId: link.id,
    resourceType: 'plan',
    setaId: input.seta_id,
    externalId: etagRow.externalId,
    etag: result.etag,
    lastSyncedFields: { title: result.object.title },
  });
  await deps.planner.updatePlan({
    plan_id: input.seta_id,
    patch: { external_etag: result.etag, external_synced_at: new Date().toISOString() },
    session,
  });
  return 'ok';
}

async function runPlanDetails(
  input: RunPlanPushInput,
  deps: RunPlanPushDeps,
  link: { id: string; externalId: string },
  session: PlannerSessionScope,
): Promise<DispatchOutcome> {
  const etagRow = await loadEtag(deps, link, 'planDetails', input.seta_id);
  if (!etagRow) return 'ok';
  const local = await deps.planner.readPlanDetails({ plan_id: input.seta_id, session });
  const snapshot = snapshotPlanDetails(etagRow.lastSyncedFields);

  const result = await patchWithRetry(
    etagRow.etag,
    (remote) =>
      buildPlanDetailsPatch({
        local,
        snapshot,
        remote: remote ? { categoryDescriptions: remote.categoryDescriptions ?? {} } : undefined,
        changedFields: input.changed_fields,
      }),
    (body, etag) => deps.graph.patchPlanDetails(etagRow.externalId, body, etag),
    () =>
      deps.graph.getPlanDetails(etagRow.externalId).then((object) => ({
        object,
        etag: object['@odata.etag'],
      })),
    input.tenant_id,
  );

  if (result.status === 'conflict') {
    await maybeEmitConflict(deps, input, result.conflicts ?? [], session);
    return 'conflict';
  }
  if (result.status === 'noop' || !result.object || !result.etag) return 'ok';

  await deps.etagRepo.upsert({
    tenantId: input.tenant_id,
    planLinkId: link.id,
    resourceType: 'planDetails',
    setaId: input.seta_id,
    externalId: etagRow.externalId,
    etag: result.etag,
    lastSyncedFields: { categoryDescriptions: result.object.categoryDescriptions ?? {} },
  });
  return 'ok';
}

async function runBucket(
  input: RunPlanPushInput,
  deps: RunPlanPushDeps,
  link: { id: string; externalId: string },
  session: PlannerSessionScope,
): Promise<DispatchOutcome> {
  const etagRow = await loadEtag(deps, link, 'bucket', input.seta_id);
  if (!etagRow) return 'ok';
  const local = await deps.planner.readBucket({ bucket_id: input.seta_id, session });
  const snapshot = snapshotBucket(etagRow.lastSyncedFields);

  const result = await patchWithRetry(
    etagRow.etag,
    (remote) =>
      buildBucketPatch({
        local,
        snapshot,
        remote: remote ? { name: remote.name, orderHint: remote.orderHint } : undefined,
        changedFields: input.changed_fields,
      }),
    (body, etag) => deps.graph.patchBucket(etagRow.externalId, body, etag),
    () =>
      deps.graph
        .listBuckets(link.externalId)
        .then((arr) => arr.find((b) => b.id === etagRow.externalId))
        .then((object) => {
          if (!object) throw new Error('bucket vanished');
          return { object, etag: object['@odata.etag'] };
        }),
    input.tenant_id,
  );

  if (result.status === 'conflict') {
    await maybeEmitConflict(deps, input, result.conflicts ?? [], session);
    return 'conflict';
  }
  if (result.status === 'noop' || !result.object || !result.etag) return 'ok';

  await deps.etagRepo.upsert({
    tenantId: input.tenant_id,
    planLinkId: link.id,
    resourceType: 'bucket',
    setaId: input.seta_id,
    externalId: etagRow.externalId,
    etag: result.etag,
    lastSyncedFields: { name: result.object.name, orderHint: result.object.orderHint },
  });
  await deps.planner.updateBucket({
    bucket_id: input.seta_id,
    patch: {
      external_etag: result.etag,
      external_synced_at: new Date().toISOString(),
      order_hint: result.object.orderHint,
    },
    session,
  });
  return 'ok';
}

async function runTask(
  input: RunPlanPushInput,
  deps: RunPlanPushDeps,
  link: { id: string; externalId: string },
  session: PlannerSessionScope,
): Promise<DispatchOutcome> {
  const etagRow = await loadEtag(deps, link, 'task', input.seta_id);
  if (!etagRow) return 'ok';
  const local = await deps.planner.readTask({ task_id: input.seta_id, session });
  const snapshot = snapshotTask(etagRow.lastSyncedFields);

  // orderHint moves through bucketTaskBoardTaskFormat, not /tasks. Split it out
  // and dispatch a sibling sub-call after the main task PATCH succeeds.
  const taskFields = input.changed_fields.filter((f) => f !== 'orderHint');
  const hasOrderHintMove = input.changed_fields.includes('orderHint');

  const result = await patchWithRetry(
    etagRow.etag,
    (remote) =>
      buildTaskPatch({
        local,
        snapshot,
        remote: remote
          ? {
              title: remote.title,
              dueDateTime: remote.dueDateTime ?? null,
              startDateTime: remote.startDateTime ?? null,
              priority: remote.priority,
              percentComplete: remote.percentComplete,
              bucketId: remote.bucketId,
              assigneePriority: remote.assigneePriority,
              appliedCategories: remote.appliedCategories ?? {},
              assignments: remote.assignments ?? {},
              conversationThreadId: remote.conversationThreadId ?? null,
            }
          : undefined,
        changedFields: taskFields,
      }),
    (body, etag) => deps.graph.patchTask(etagRow.externalId, body, etag),
    () =>
      deps.graph
        .listTasks(link.externalId)
        .then((arr) => arr.find((t) => t.id === etagRow.externalId))
        .then((object) => {
          if (!object) throw new Error('task vanished');
          return { object, etag: object['@odata.etag'] };
        }),
    input.tenant_id,
  );

  if (result.status === 'conflict') {
    await maybeEmitConflict(deps, input, result.conflicts ?? [], session, input.seta_id);
    return 'conflict';
  }

  // Even on noop for the main task body, an orderHint move may still need to run.
  if (result.status === 'ok' && result.object && result.etag) {
    const snapshotFields: Partial<GraphTaskPatchable> = {
      title: result.object.title,
      dueDateTime: result.object.dueDateTime ?? null,
      startDateTime: result.object.startDateTime ?? null,
      priority: result.object.priority,
      percentComplete: result.object.percentComplete,
      bucketId: result.object.bucketId,
      assigneePriority: result.object.assigneePriority,
      appliedCategories: result.object.appliedCategories ?? {},
      assignments: result.object.assignments ?? {},
      conversationThreadId: result.object.conversationThreadId ?? null,
    };
    await deps.etagRepo.upsert({
      tenantId: input.tenant_id,
      planLinkId: link.id,
      resourceType: 'task',
      setaId: input.seta_id,
      externalId: etagRow.externalId,
      etag: result.etag,
      lastSyncedFields: snapshotFields,
    });
    await deps.planner.updateTask({
      task_id: input.seta_id,
      patch: { external_etag: result.etag, external_synced_at: new Date().toISOString() },
      session,
    });
  }

  if (hasOrderHintMove) {
    const o = await runBoardFormat(
      {
        ...input,
        resource_type: 'bucketTaskBoardTaskFormat',
        changed_fields: ['orderHint'],
      },
      deps,
      link,
      session,
    );
    if (o === 'conflict') return 'conflict';
  }
  return 'ok';
}

async function runTaskDetails(
  input: RunPlanPushInput,
  deps: RunPlanPushDeps,
  link: { id: string; externalId: string },
  session: PlannerSessionScope,
): Promise<DispatchOutcome> {
  const etagRow = await loadEtag(deps, link, 'taskDetails', input.seta_id);
  if (!etagRow) return 'ok';
  const local = await deps.planner.readTaskDetails({ task_id: input.seta_id, session });
  const snapshot = snapshotTaskDetails(etagRow.lastSyncedFields);

  const result = await patchWithRetry(
    etagRow.etag,
    (remote) =>
      buildTaskDetailsPatch({
        local,
        snapshot,
        remote: remote
          ? {
              description: remote.description ?? null,
              previewType: remote.previewType,
              checklist: remote.checklist ?? {},
              references: remote.references ?? {},
            }
          : undefined,
        changedFields: input.changed_fields,
      }),
    (body, etag) => deps.graph.patchTaskDetails(etagRow.externalId, body, etag),
    () =>
      deps.graph.getTaskDetails(etagRow.externalId).then((object) => ({
        object,
        etag: object['@odata.etag'],
      })),
    input.tenant_id,
  );

  if (result.status === 'conflict') {
    await maybeEmitConflict(deps, input, result.conflicts ?? [], session, input.seta_id);
    return 'conflict';
  }
  if (result.status === 'noop' || !result.object || !result.etag) return 'ok';

  await deps.etagRepo.upsert({
    tenantId: input.tenant_id,
    planLinkId: link.id,
    resourceType: 'taskDetails',
    setaId: input.seta_id,
    externalId: etagRow.externalId,
    etag: result.etag,
    lastSyncedFields: {
      description: result.object.description ?? null,
      previewType: result.object.previewType,
      checklist: result.object.checklist ?? {},
      references: result.object.references ?? {},
    },
  });
  return 'ok';
}

async function runBoardFormat(
  input: RunPlanPushInput,
  deps: RunPlanPushDeps,
  link: { id: string; externalId: string },
  session: PlannerSessionScope,
): Promise<DispatchOutcome> {
  const etagRow = await loadEtag(deps, link, 'bucketTaskBoardTaskFormat', input.seta_id);
  if (!etagRow) return 'ok';
  const local = await deps.planner.readTaskOrderHint({ task_id: input.seta_id, session });
  const snapshot = snapshotBoardFormat(etagRow.lastSyncedFields);

  const result = await patchWithRetry(
    etagRow.etag,
    (remote) =>
      buildBucketTaskBoardTaskFormatPatch({
        local,
        snapshot,
        remote: remote ? { orderHint: remote.orderHint } : undefined,
        changedFields: input.changed_fields,
      }),
    (body, etag) =>
      // patchBucketTaskBoardTaskFormat expects body typed as { orderHint: string }.
      deps.graph.patchBucketTaskBoardTaskFormat(
        etagRow.externalId,
        body as { orderHint: string },
        etag,
      ),
    () =>
      deps.graph.getBucketTaskBoardTaskFormat(etagRow.externalId).then((object) => ({
        object,
        etag: object['@odata.etag'],
      })),
    input.tenant_id,
  );

  if (result.status === 'conflict') {
    await maybeEmitConflict(deps, input, result.conflicts ?? [], session, input.seta_id);
    return 'conflict';
  }
  if (result.status === 'noop' || !result.object || !result.etag) return 'ok';

  await deps.etagRepo.upsert({
    tenantId: input.tenant_id,
    planLinkId: link.id,
    resourceType: 'bucketTaskBoardTaskFormat',
    setaId: input.seta_id,
    externalId: etagRow.externalId,
    etag: result.etag,
    lastSyncedFields: { orderHint: result.object.orderHint },
  });
  // The Graph echo for orderHint is the canonical short form (e.g. "7A$6").
  // Persist it back to Seta so the local UI matches the server-canonical hint.
  await deps.planner.updateTask({
    task_id: input.seta_id,
    patch: { order_hint: result.object.orderHint },
    session,
  });
  return 'ok';
}
