import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import type { NodeTx } from '@seta/shared-db';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { emitPlannerTaskLinkAdded } from '../../events/emit-helpers.ts';
import { plans, taskReferences, tasks } from '../db/schema.ts';
import type { TaskLinkKind } from '../dto.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { TASK_LINK_KIND_LIST, taskIdFromLinkUrl, taskLinkUrl } from './_task-link-row.ts';

export interface LinkTasksInput {
  source_task_id: string;
  target_task_id: string;
  kind: TaskLinkKind;
}

/** The same local detector every planner writer uses: `code === '23505'`, one
 *  level of `cause`. No call site anywhere reads `constraint`, so this catch
 *  CANNOT tell which unique index fired — and does not need to. The pre-checks
 *  own the wording on every reachable path; this is the race backstop, plus the
 *  one edge the pair read cannot see: a BOOKMARK row a user pasted by hand whose
 *  url is already the target's canonical path (design §3.2, §3.11). */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if ('code' in err && (err as { code: unknown }).code === '23505') return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    (cause as { code: unknown }).code === '23505'
  );
}

/** Both endpoints must be LIVE. `unlinkTasks` deliberately does NOT mirror this
 *  filter — see the comment there; the asymmetry is load-bearing. */
async function readLiveTask(tx: NodeTx, taskId: string, tenantId: string) {
  const [row] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), isNull(tasks.deleted_at)))
    .limit(1);
  if (!row) throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: taskId });
  if (row.tenant_id !== tenantId) {
    throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', { task_id: taskId });
  }
  return row;
}

async function readPlanGroup(tx: NodeTx, planId: string): Promise<string> {
  const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: planId });
  return plan.group_id;
}

/**
 * The serialisation point for every pair-level rule (design D9, §3.2 step 5).
 *
 * The two ids are sorted, so BOTH directions of a pair hash to one key and the
 * read that follows is race-free. Deadlock-free by construction: a transaction
 * takes at most ONE pair lock, always after the gateway's
 * `(tenant, idempotencyKey)` lock, and the tenant id is inside the hashed string
 * so two tenants cannot collide on one key.
 *
 * This is the ONLY mechanism for symmetric `relates`, mutual `blocks` and the
 * two-opposite-merges race: the equivalent index would have to regex a uuid out
 * of a text column inside its key (§3.1, §8.6).
 */
async function lockPair(tx: NodeTx, tenantId: string, a: string, b: string): Promise<void> {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const key = `${tenantId}:${lo}:${hi}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`);
}

interface PairRow {
  id: string;
  type: TaskLinkKind;
  task_id: string;
  url: string;
}

/** Every link row on this pair, EITHER direction. At most one exists in
 *  practice — that is what the pre-checks maintain — but the read does not
 *  assume it, because §3.11's guards, not the storage, are what keep the writer
 *  set closed. */
async function readPairRows(
  tx: NodeTx,
  tenantId: string,
  sourceId: string,
  targetId: string,
): Promise<PairRow[]> {
  const rows = await tx
    .select({
      id: taskReferences.id,
      type: taskReferences.type,
      task_id: taskReferences.task_id,
      url: taskReferences.url,
    })
    .from(taskReferences)
    .where(
      and(
        eq(taskReferences.tenant_id, tenantId),
        inArray(taskReferences.type, TASK_LINK_KIND_LIST),
        or(
          and(eq(taskReferences.task_id, sourceId), eq(taskReferences.url, taskLinkUrl(targetId))),
          and(eq(taskReferences.task_id, targetId), eq(taskReferences.url, taskLinkUrl(sourceId))),
        ),
      ),
    );
  return rows.map((r) => ({ ...r, type: r.type as TaskLinkKind }));
}

/** Steps 1-5 of §3.2, shared by both writers: two live endpoints, two groups,
 *  the two-endpoint gate, then the pair lock. */
async function prepareEndpoints(
  tx: NodeTx,
  session: SessionScope,
  sourceTaskId: string,
  targetTaskId: string,
) {
  const source = await readLiveTask(tx, sourceTaskId, session.tenant_id);
  const target = await readLiveTask(tx, targetTaskId, session.tenant_id);
  const sourceGroup = await readPlanGroup(tx, source.plan_id);
  const targetGroup = await readPlanGroup(tx, target.plan_id);
  // The two-endpoint gate, which is what FUT-820 is actually for: without the
  // target-side check an actor could link to — and therefore learn the title of
  // — a task in a group they cannot reach.
  await requirePermission(session, 'planner.task.update', sourceGroup);
  await requirePermission(session, 'planner.task.update', targetGroup);
  await lockPair(tx, session.tenant_id, source.id, target.id);
  return { source, target, sourceGroup, targetGroup };
}

/** One canonical `duplicates` target per task. The partial unique index enforces
 *  it too; this exists so the refusal can NAME the target that is already there. */
async function assertNoOtherDuplicate(
  tx: NodeTx,
  tenantId: string,
  sourceTaskId: string,
): Promise<void> {
  const [other] = await tx
    .select({ url: taskReferences.url })
    .from(taskReferences)
    .where(
      and(
        eq(taskReferences.tenant_id, tenantId),
        eq(taskReferences.task_id, sourceTaskId),
        eq(taskReferences.type, 'duplicates'),
      ),
    )
    .limit(1);
  if (other) {
    throw new PlannerError(
      'DUPLICATE_REFERENCE',
      'That task is already marked as a duplicate of another task',
      { source_task_id: sourceTaskId, target_task_id: taskIdFromLinkUrl(other.url) },
    );
  }
}

/**
 * Create a task↔task relationship as a row of `planner.task_references`.
 *
 * A pair-direction carries ONE kind at a time, because
 * UNIQUE (tenant_id, task_id, url) ignores `type` (design D8). So this function
 * never rewrites an existing relationship — it names it and refuses. Merge is
 * the single exception and it has its own writer, `markAsDuplicate` below.
 */
export async function linkTasks(
  input: LinkTasksInput & { session: SessionScope },
): Promise<{ id: string }> {
  return withSpan(
    'planner.task.link',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.task_id': input.source_task_id,
    },
    () => linkTasksImpl(input),
  );
}

async function linkTasksImpl(
  input: LinkTasksInput & { session: SessionScope },
): Promise<{ id: string }> {
  // Cheapest rule first, and it produces a sentence rather than a constraint
  // error — the table's CHECK is the backstop, not the message.
  if (input.source_task_id === input.target_task_id) {
    throw new PlannerError('VALIDATION', 'A task cannot be linked to itself', {
      task_id: input.source_task_id,
    });
  }

  let referenceId!: string;
  await withEmit(
    { actor: { userId: input.session.user_id, tenantId: input.session.tenant_id } },
    async (tx) => {
      const { source, target, sourceGroup } = await prepareEndpoints(
        tx,
        input.session,
        input.source_task_id,
        input.target_task_id,
      );

      // Read the pair INSIDE the lock, and give every branch its own sentence,
      // so the general 23505 message below is never what a user reads.
      const [existing] = await readPairRows(tx, source.tenant_id, source.id, target.id);
      if (existing) {
        const details = {
          source_task_id: source.id,
          target_task_id: target.id,
          reference_id: existing.id,
          existing_kind: existing.type,
        };
        if (existing.type !== input.kind) {
          throw new PlannerError(
            'DUPLICATE_REFERENCE',
            `Those two tasks are already linked as "${existing.type}". Remove that link first.`,
            details,
          );
        }
        if (existing.task_id === source.id) {
          throw new PlannerError(
            'DUPLICATE_REFERENCE',
            'Those two tasks are already linked that way',
            details,
          );
        }
        throw new PlannerError(
          'DUPLICATE_REFERENCE',
          existing.type === 'duplicates'
            ? 'Those two tasks are already merged the other way round'
            : 'Those two tasks are already linked that way, in the other direction',
          details,
        );
      }

      if (input.kind === 'duplicates') {
        await assertNoOtherDuplicate(tx, source.tenant_id, source.id);
      }

      try {
        const [row] = await tx
          .insert(taskReferences)
          .values({
            tenant_id: source.tenant_id,
            task_id: source.id,
            url: taskLinkUrl(target.id),
            type: input.kind,
          })
          .returning({ id: taskReferences.id });
        if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
        referenceId = row.id;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new PlannerError(
            'DUPLICATE_REFERENCE',
            'Reference with this URL already exists on task',
            { task_id: source.id, url: taskLinkUrl(target.id) },
          );
        }
        throw err;
      }

      await emitPlannerTaskLinkAdded({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: source.tenant_id,
        group_id: sourceGroup,
        reference_id: referenceId,
        source_task_id: source.id,
        target_task_id: target.id,
        source_plan_id: source.plan_id,
        target_plan_id: target.plan_id,
        kind: input.kind,
      });
    },
  );

  return { id: referenceId };
}

/**
 * Merge's own writer: mark `duplicate_task_id` as a duplicate of `keep_task_id`,
 * PROMOTING an existing `relates` row instead of adding a second one.
 *
 * It is a named export rather than `linkTasks({ …, allowKindChange: true })` on
 * purpose (design §3.7, and the same poka-yoke argument as §1.2): the one path
 * allowed to overwrite an existing relationship should say so in its name, so no
 * future caller reaches it by flipping a boolean.
 *
 * Promotion is required, not a nicety: D8 forbids a second row on the pair, and
 * the common case is exactly a pair the dedup workflow already marked `relates`.
 * The row keeps its `id`, so a link the user is looking at does not change
 * identity underneath them, and `touch_updated_at` moves `updated_at`.
 */
export async function markAsDuplicate(input: {
  duplicate_task_id: string;
  keep_task_id: string;
  session: SessionScope;
}): Promise<{ id: string }> {
  return withSpan(
    'planner.task.mark-duplicate',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.task_id': input.duplicate_task_id,
    },
    () => markAsDuplicateImpl(input),
  );
}

async function markAsDuplicateImpl(input: {
  duplicate_task_id: string;
  keep_task_id: string;
  session: SessionScope;
}): Promise<{ id: string }> {
  if (input.duplicate_task_id === input.keep_task_id) {
    throw new PlannerError('VALIDATION', 'A task cannot be a duplicate of itself', {
      task_id: input.duplicate_task_id,
    });
  }

  let referenceId!: string;
  await withEmit(
    { actor: { userId: input.session.user_id, tenantId: input.session.tenant_id } },
    async (tx) => {
      const {
        source: duplicate,
        target: keep,
        sourceGroup,
      } = await prepareEndpoints(tx, input.session, input.duplicate_task_id, input.keep_task_id);

      const pair = await readPairRows(tx, duplicate.tenant_id, duplicate.id, keep.id);
      if (pair.some((r) => r.type === 'blocks')) {
        throw new PlannerError(
          'DUPLICATE_REFERENCE',
          'Those two tasks are already linked as "blocks". Remove that link first.',
          { source_task_id: duplicate.id, target_task_id: keep.id, existing_kind: 'blocks' },
        );
      }
      const merged = pair.find((r) => r.type === 'duplicates');
      if (merged) {
        throw new PlannerError('DUPLICATE_REFERENCE', 'Those two tasks are already merged', {
          source_task_id: duplicate.id,
          target_task_id: keep.id,
          reference_id: merged.id,
        });
      }

      await assertNoOtherDuplicate(tx, duplicate.tenant_id, duplicate.id);

      const related = pair.find((r) => r.type === 'relates');
      if (related) {
        // In place, and into the CANONICAL direction: the source of a
        // `duplicates` row is always the task that gets trashed, even when the
        // user's original `relates` row pointed the other way.
        await tx
          .update(taskReferences)
          .set({ type: 'duplicates', task_id: duplicate.id, url: taskLinkUrl(keep.id) })
          .where(eq(taskReferences.id, related.id));
        referenceId = related.id;
      } else {
        const [row] = await tx
          .insert(taskReferences)
          .values({
            tenant_id: duplicate.tenant_id,
            task_id: duplicate.id,
            url: taskLinkUrl(keep.id),
            type: 'duplicates',
          })
          .returning({ id: taskReferences.id });
        if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
        referenceId = row.id;
      }

      // A promotion emits link-added with the NEW kind: there is no
      // `link-changed` event, subscribers are keyed on the source task either
      // way, and merge's audit envelope carries the before/after pair.
      await emitPlannerTaskLinkAdded({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: duplicate.tenant_id,
        group_id: sourceGroup,
        reference_id: referenceId,
        source_task_id: duplicate.id,
        target_task_id: keep.id,
        source_plan_id: duplicate.plan_id,
        target_plan_id: keep.plan_id,
        kind: 'duplicates',
      });
    },
  );

  return { id: referenceId };
}
