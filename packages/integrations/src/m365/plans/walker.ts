import { isDeepStrictEqual } from 'node:util';
import type { GraphBucket, GraphPlan, GraphPlanDetails, GraphTask } from '../jobs/_graph-types.ts';
import { resolveField } from '../lww.ts';

export interface LocalTaskRow {
  id: string;
  external_id: string | null;
  external_etag: string | null;
  title: string;
  bucket_id: string;
}

export interface LocalBucketRow {
  id: string;
  external_id: string | null;
  name: string;
  order_hint: string;
}

export interface LocalPlanState {
  plan: { id: string; title: string };
  planDetails: { categoryDescriptions: Record<string, string | null> };
  buckets: LocalBucketRow[];
  tasks: LocalTaskRow[];
}

export interface RemoteState {
  plan: GraphPlan;
  planDetails: GraphPlanDetails;
  buckets: GraphBucket[];
  tasks: GraphTask[];
}

export interface KnownEtags {
  plan?: string;
  planDetails?: string;
  buckets: Map<string, string>;
  tasks: Map<string, string>;
  taskDetails: Map<string, string>;
  boardFormats: Map<string, string>;
}

export interface FieldConflict {
  scope: 'plan';
  field: 'title';
  local: unknown;
  remote: unknown;
  snapshot: unknown;
}

export interface WalkActions {
  changedTaskExternalIds: string[];
  removedTaskExternalIds: string[];
  changedBucketExternalIds: string[];
  removedBucketExternalIds: string[];
  planFieldsToApply: { title?: string };
  categoryDescriptionsToApply?: Record<string, string | null>;
  fieldConflicts: FieldConflict[];
}

export function walk(input: {
  local: LocalPlanState;
  remote: RemoteState;
  knownEtags: KnownEtags;
  snapshot: Record<string, unknown>;
}): WalkActions {
  const { local, remote, knownEtags, snapshot } = input;

  const actions: WalkActions = {
    changedTaskExternalIds: [],
    removedTaskExternalIds: [],
    changedBucketExternalIds: [],
    removedBucketExternalIds: [],
    planFieldsToApply: {},
    fieldConflicts: [],
  };

  // 1. Plan title LWW
  const snapshotPlan = snapshot.plan as Record<string, unknown> | undefined;
  const snapshotTitle = (snapshotPlan?.title as string | undefined) ?? local.plan.title;
  const titleDecision = resolveField({
    local: local.plan.title,
    remote: remote.plan.title,
    snapshot: snapshotTitle,
  });

  if (titleDecision.kind === 'remote-wins') {
    actions.planFieldsToApply.title = titleDecision.value;
  } else if (titleDecision.kind === 'conflict') {
    actions.fieldConflicts.push({
      scope: 'plan',
      field: 'title',
      local: titleDecision.local,
      remote: titleDecision.remote,
      snapshot: titleDecision.snapshot,
    });
  }

  // 2. categoryDescriptions diff
  const CATEGORY_COUNT = 25;
  const remoteCategories = remote.planDetails.categoryDescriptions ?? {};
  const localCategories = local.planDetails.categoryDescriptions;

  const remoteCategoryDescriptions: Record<string, string | null> = {};
  const localCategoryDescriptions: Record<string, string | null> = {};

  for (let n = 1; n <= CATEGORY_COUNT; n++) {
    const key = `category${n}`;
    remoteCategoryDescriptions[key] = remoteCategories[key] ?? null;
    localCategoryDescriptions[key] = localCategories[key] ?? null;
  }

  if (!isDeepStrictEqual(remoteCategoryDescriptions, localCategoryDescriptions)) {
    actions.categoryDescriptionsToApply = remoteCategoryDescriptions;
  }

  // 3. Buckets diff
  const localBucketByExt = new Map<string, LocalBucketRow>();
  for (const lb of local.buckets) {
    if (lb.external_id !== null) {
      localBucketByExt.set(lb.external_id, lb);
    }
  }

  const remoteBucketByExt = new Map<string, GraphBucket>();
  for (const rb of remote.buckets) {
    remoteBucketByExt.set(rb.id, rb);
  }

  for (const [extId, rb] of remoteBucketByExt) {
    const knownEtag = knownEtags.buckets.get(extId);
    if (knownEtag !== rb['@odata.etag']) {
      actions.changedBucketExternalIds.push(extId);
    }
  }

  for (const extId of localBucketByExt.keys()) {
    if (!remoteBucketByExt.has(extId)) {
      actions.removedBucketExternalIds.push(extId);
    }
  }

  // 4. Tasks diff
  const localTaskByExt = new Map<string, LocalTaskRow>();
  for (const lt of local.tasks) {
    if (lt.external_id !== null) {
      localTaskByExt.set(lt.external_id, lt);
    }
  }

  const remoteTaskByExt = new Map<string, GraphTask>();
  for (const rt of remote.tasks) {
    remoteTaskByExt.set(rt.id, rt);
  }

  for (const [extId, rt] of remoteTaskByExt) {
    const knownEtag = knownEtags.tasks.get(extId);
    if (knownEtag !== rt['@odata.etag']) {
      actions.changedTaskExternalIds.push(extId);
    }
  }

  for (const extId of localTaskByExt.keys()) {
    if (!remoteTaskByExt.has(extId)) {
      actions.removedTaskExternalIds.push(extId);
    }
  }

  return actions;
}
