import type {
  GraphAppliedCategories,
  GraphAssignment,
  GraphAssignments,
  GraphBucket,
  GraphBucketTaskBoardTaskFormat,
  GraphChecklistItem,
  GraphPlan,
  GraphPlanDetails,
  GraphTask,
  GraphTaskDetails,
  GraphTaskReference,
} from '../jobs/_graph-types.ts';
import { resolveDict, resolveField } from '../lww.ts';

// Each builder operates purely in Graph-DTO space (the dispatcher is responsible
// for translating Seta rows into Graph-shaped values before calling). It returns
// a PATCH body containing only fields where local edits should be sent, plus a
// conflict list the caller emits as `integrations.m365.{plan,task}.field-conflict.v1`.
//
// `remote` is optional. On a normal push (no 412 retry yet), the caller passes
// `remote = snapshot` — under that input resolveField only yields noop/local-wins,
// so conflicts are impossible. On a 412 retry the caller fetches the fresh remote
// and passes it: now any divergence on the same field surfaces as a conflict.

export interface FieldConflict {
  field: string;
  local: unknown;
  remote: unknown;
  snapshot: unknown;
}

export interface BuildResult {
  body: Record<string, unknown>;
  conflicts: FieldConflict[];
}

type ScalarFieldSpec<L, R> = {
  // `field` is both the changedFields filter key and the conflict's `field` name.
  // `graphKey` is the Graph PATCH body key (defaults to `field`).
  field: string;
  graphKey?: string;
  get: (x: L) => R;
};

function resolveScalar<L, R>(
  spec: ScalarFieldSpec<L, R>,
  local: L,
  snapshot: L,
  remote: L,
  changedFields: ReadonlySet<string>,
  body: Record<string, unknown>,
  conflicts: FieldConflict[],
): void {
  if (!changedFields.has(spec.field)) return;
  const decision = resolveField<R>({
    local: spec.get(local),
    remote: spec.get(remote),
    snapshot: spec.get(snapshot),
  });
  if (decision.kind === 'local-wins') {
    body[spec.graphKey ?? spec.field] = decision.value;
  } else if (decision.kind === 'conflict') {
    conflicts.push({
      field: spec.field,
      local: decision.local,
      remote: decision.remote,
      snapshot: decision.snapshot,
    });
  }
}

type DictFieldSpec<L, V> = {
  field: string;
  graphKey?: string;
  get: (x: L) => Record<string, V | undefined>;
};

function resolveDictField<L, V>(
  spec: DictFieldSpec<L, V>,
  local: L,
  snapshot: L,
  remote: L,
  changedFields: ReadonlySet<string>,
  body: Record<string, unknown>,
  conflicts: FieldConflict[],
): void {
  if (!changedFields.has(spec.field)) return;
  const result = resolveDict<V>({
    local: spec.get(local),
    remote: spec.get(remote),
    snapshot: spec.get(snapshot),
  });
  if (Object.keys(result.patch).length > 0) {
    body[spec.graphKey ?? spec.field] = result.patch;
  }
  for (const c of result.conflicts) {
    conflicts.push({
      field: `${spec.field}.${c.key}`,
      local: c.local,
      remote: c.remote,
      snapshot: c.snapshot,
    });
  }
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface BuildPlanPatchInput {
  local: Pick<GraphPlan, 'title'>;
  snapshot: Pick<GraphPlan, 'title'>;
  remote?: Pick<GraphPlan, 'title'>;
  changedFields: readonly string[];
}

export function buildPlanPatch(input: BuildPlanPatchInput): BuildResult {
  const body: Record<string, unknown> = {};
  const conflicts: FieldConflict[] = [];
  const changed = new Set(input.changedFields);
  const remote = input.remote ?? input.snapshot;
  resolveScalar<Pick<GraphPlan, 'title'>, string>(
    { field: 'title', get: (x) => x.title },
    input.local,
    input.snapshot,
    remote,
    changed,
    body,
    conflicts,
  );
  return { body, conflicts };
}

// ---------------------------------------------------------------------------
// Plan details (category descriptions)
// ---------------------------------------------------------------------------

export interface BuildPlanDetailsPatchInput {
  local: Pick<GraphPlanDetails, 'categoryDescriptions'>;
  snapshot: Pick<GraphPlanDetails, 'categoryDescriptions'>;
  remote?: Pick<GraphPlanDetails, 'categoryDescriptions'>;
  changedFields: readonly string[];
}

export function buildPlanDetailsPatch(input: BuildPlanDetailsPatchInput): BuildResult {
  const body: Record<string, unknown> = {};
  const conflicts: FieldConflict[] = [];
  const changed = new Set(input.changedFields);
  const remote = input.remote ?? input.snapshot;
  resolveDictField<Pick<GraphPlanDetails, 'categoryDescriptions'>, string | null>(
    {
      field: 'categoryDescriptions',
      get: (x) => (x.categoryDescriptions ?? {}) as Record<string, string | null | undefined>,
    },
    input.local,
    input.snapshot,
    remote,
    changed,
    body,
    conflicts,
  );
  return { body, conflicts };
}

// ---------------------------------------------------------------------------
// Bucket
// ---------------------------------------------------------------------------

export interface BuildBucketPatchInput {
  local: Pick<GraphBucket, 'name' | 'orderHint'>;
  snapshot: Pick<GraphBucket, 'name' | 'orderHint'>;
  remote?: Pick<GraphBucket, 'name' | 'orderHint'>;
  changedFields: readonly string[];
}

export function buildBucketPatch(input: BuildBucketPatchInput): BuildResult {
  const body: Record<string, unknown> = {};
  const conflicts: FieldConflict[] = [];
  const changed = new Set(input.changedFields);
  const remote = input.remote ?? input.snapshot;
  type B = Pick<GraphBucket, 'name' | 'orderHint'>;
  resolveScalar<B, string>(
    { field: 'name', get: (x) => x.name },
    input.local,
    input.snapshot,
    remote,
    changed,
    body,
    conflicts,
  );
  resolveScalar<B, string>(
    { field: 'orderHint', get: (x) => x.orderHint },
    input.local,
    input.snapshot,
    remote,
    changed,
    body,
    conflicts,
  );
  return { body, conflicts };
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export type GraphTaskPatchable = Pick<
  GraphTask,
  | 'title'
  | 'dueDateTime'
  | 'startDateTime'
  | 'priority'
  | 'percentComplete'
  | 'bucketId'
  | 'assigneePriority'
  | 'appliedCategories'
  | 'assignments'
  | 'conversationThreadId'
>;

export interface BuildTaskPatchInput {
  local: GraphTaskPatchable;
  snapshot: GraphTaskPatchable;
  remote?: GraphTaskPatchable;
  changedFields: readonly string[];
}

export function buildTaskPatch(input: BuildTaskPatchInput): BuildResult {
  const body: Record<string, unknown> = {};
  const conflicts: FieldConflict[] = [];
  const changed = new Set(input.changedFields);
  const remote = input.remote ?? input.snapshot;

  const scalars: Array<{
    field: string;
    get: (x: GraphTaskPatchable) => unknown;
  }> = [
    { field: 'title', get: (x) => x.title },
    { field: 'dueDateTime', get: (x) => x.dueDateTime ?? null },
    { field: 'startDateTime', get: (x) => x.startDateTime ?? null },
    { field: 'priority', get: (x) => x.priority },
    { field: 'percentComplete', get: (x) => x.percentComplete },
    { field: 'bucketId', get: (x) => x.bucketId },
    { field: 'assigneePriority', get: (x) => x.assigneePriority },
    { field: 'conversationThreadId', get: (x) => x.conversationThreadId ?? null },
  ];
  for (const spec of scalars) {
    resolveScalar(spec, input.local, input.snapshot, remote, changed, body, conflicts);
  }

  resolveDictField<GraphTaskPatchable, boolean>(
    {
      field: 'appliedCategories',
      get: (x) => (x.appliedCategories ?? {}) as Record<string, boolean | undefined>,
    },
    input.local,
    input.snapshot,
    remote,
    changed,
    body,
    conflicts,
  );

  resolveDictField<GraphTaskPatchable, GraphAssignment>(
    {
      field: 'assignments',
      get: (x) => (x.assignments ?? {}) as Record<string, GraphAssignment | undefined>,
    },
    input.local,
    input.snapshot,
    remote,
    changed,
    body,
    conflicts,
  );

  return { body, conflicts };
}

// ---------------------------------------------------------------------------
// Task details
// ---------------------------------------------------------------------------

export type GraphTaskDetailsPatchable = Pick<
  GraphTaskDetails,
  'description' | 'previewType' | 'checklist' | 'references'
>;

export interface BuildTaskDetailsPatchInput {
  local: GraphTaskDetailsPatchable;
  snapshot: GraphTaskDetailsPatchable;
  remote?: GraphTaskDetailsPatchable;
  changedFields: readonly string[];
}

export function buildTaskDetailsPatch(input: BuildTaskDetailsPatchInput): BuildResult {
  const body: Record<string, unknown> = {};
  const conflicts: FieldConflict[] = [];
  const changed = new Set(input.changedFields);
  const remote = input.remote ?? input.snapshot;

  resolveScalar<GraphTaskDetailsPatchable, string | null>(
    { field: 'description', get: (x) => x.description ?? null },
    input.local,
    input.snapshot,
    remote,
    changed,
    body,
    conflicts,
  );
  resolveScalar<GraphTaskDetailsPatchable, string | undefined>(
    { field: 'previewType', get: (x) => x.previewType },
    input.local,
    input.snapshot,
    remote,
    changed,
    body,
    conflicts,
  );

  resolveDictField<GraphTaskDetailsPatchable, GraphChecklistItem>(
    {
      field: 'checklist',
      get: (x) => (x.checklist ?? {}) as Record<string, GraphChecklistItem | undefined>,
    },
    input.local,
    input.snapshot,
    remote,
    changed,
    body,
    conflicts,
  );

  resolveDictField<GraphTaskDetailsPatchable, GraphTaskReference>(
    {
      field: 'references',
      get: (x) => (x.references ?? {}) as Record<string, GraphTaskReference | undefined>,
    },
    input.local,
    input.snapshot,
    remote,
    changed,
    body,
    conflicts,
  );

  return { body, conflicts };
}

// ---------------------------------------------------------------------------
// bucketTaskBoardTaskFormat (single field)
// ---------------------------------------------------------------------------

export interface BuildBucketTaskBoardTaskFormatPatchInput {
  local: Pick<GraphBucketTaskBoardTaskFormat, 'orderHint'>;
  snapshot: Pick<GraphBucketTaskBoardTaskFormat, 'orderHint'>;
  remote?: Pick<GraphBucketTaskBoardTaskFormat, 'orderHint'>;
  changedFields: readonly string[];
}

export function buildBucketTaskBoardTaskFormatPatch(
  input: BuildBucketTaskBoardTaskFormatPatchInput,
): BuildResult {
  const body: Record<string, unknown> = {};
  const conflicts: FieldConflict[] = [];
  const changed = new Set(input.changedFields);
  const remote = input.remote ?? input.snapshot;
  resolveScalar<Pick<GraphBucketTaskBoardTaskFormat, 'orderHint'>, string>(
    { field: 'orderHint', get: (x) => x.orderHint },
    input.local,
    input.snapshot,
    remote,
    changed,
    body,
    conflicts,
  );
  return { body, conflicts };
}

// Re-exports for callers that only need the Graph type aliases.
export type {
  GraphAppliedCategories,
  GraphAssignment,
  GraphAssignments,
  GraphChecklistItem,
  GraphTaskReference,
};
