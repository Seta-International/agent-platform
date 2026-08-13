import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { CycleUnlockEntry, CycleUnlockInput, CycleUnlockLog } from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { performanceCycleUnlock } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

type UnlockRow = typeof performanceCycleUnlock.$inferSelect;

function toEntry(row: UnlockRow): CycleUnlockEntry {
  return {
    id: row.id,
    review_month: row.review_month,
    scope_kind: row.scope_kind,
    scope_id: row.scope_id,
    action: row.action,
    reason: row.reason,
    actor_person_id: row.actor_person_id,
    actor_user_id: row.actor_user_id,
    created_at: row.created_at.toISOString(),
  };
}

export type OverrideScopeInput = {
  month: string;
  /** The person under evaluation (enables the person-scoped unlock). */
  person_id?: string | null;
  /** The project under evaluation (enables the project-scoped unlock). */
  project_id?: string | null;
};

/**
 * Is a manual cycle unlock (FUT-781) currently in effect for a scope covering this
 * request? Checks the month-wide scope plus, when supplied, the person and project
 * scopes. For each scope the latest audit row by (created_at, id) wins, so a re-lock
 * cancels an earlier unlock. Always tenant-filtered (defense-in-depth alongside RLS).
 */
export async function resolveOverrideActive(
  session: SessionScope,
  input: OverrideScopeInput,
): Promise<boolean> {
  const personId = input.person_id ?? null;
  const projectId = input.project_id ?? null;

  const rows = await peopleDb()
    .select({
      scope_kind: performanceCycleUnlock.scope_kind,
      scope_id: performanceCycleUnlock.scope_id,
      action: performanceCycleUnlock.action,
    })
    .from(performanceCycleUnlock)
    .where(
      and(
        eq(performanceCycleUnlock.tenant_id, session.tenant_id),
        eq(performanceCycleUnlock.review_month, input.month),
        or(
          eq(performanceCycleUnlock.scope_kind, 'month'),
          personId
            ? and(
                eq(performanceCycleUnlock.scope_kind, 'person'),
                eq(performanceCycleUnlock.scope_id, personId),
              )
            : sql`false`,
          projectId
            ? and(
                eq(performanceCycleUnlock.scope_kind, 'project'),
                eq(performanceCycleUnlock.scope_id, projectId),
              )
            : sql`false`,
        ),
      ),
    )
    // Latest first, so the first row seen per scope is the current state.
    .orderBy(desc(performanceCycleUnlock.created_at), desc(performanceCycleUnlock.id));

  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.scope_kind}:${r.scope_id ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.action === 'unlock') return true;
  }
  return false;
}

/** Apply a PMO unlock or re-lock to one exact scope (month / project / person). */
async function applyCycleUnlockAction(
  session: SessionScope,
  input: CycleUnlockInput,
  action: 'unlock' | 'relock',
): Promise<CycleUnlockEntry> {
  requirePermission(session, 'people.performance.unlock');
  const scopeId = input.scope_kind === 'month' ? null : input.scope_id;
  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new PeopleError('VALIDATION', 'reason: a justification is required');
  }
  const scopeMatch = scopeId === null ? isNull(performanceCycleUnlock.scope_id) : undefined;

  let entry: CycleUnlockEntry | undefined;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      // Serialize concurrent unlock/relock on this exact scope so two tabs can't
      // both act on the same stale state (AC — two-tab concurrency block).
      const lockKey = `perf-unlock:${session.tenant_id}:${input.month}:${input.scope_kind}:${scopeId ?? ''}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`);

      const [latest] = await tx
        .select({ action: performanceCycleUnlock.action })
        .from(performanceCycleUnlock)
        .where(
          and(
            eq(performanceCycleUnlock.tenant_id, session.tenant_id),
            eq(performanceCycleUnlock.review_month, input.month),
            eq(performanceCycleUnlock.scope_kind, input.scope_kind),
            scopeMatch ?? eq(performanceCycleUnlock.scope_id, scopeId as string),
          ),
        )
        .orderBy(desc(performanceCycleUnlock.created_at), desc(performanceCycleUnlock.id))
        .limit(1);

      const currentlyUnlocked = latest?.action === 'unlock';
      const wantUnlocked = action === 'unlock';
      if (currentlyUnlocked === wantUnlocked) {
        throw new PeopleError(
          'CONFLICT',
          wantUnlocked
            ? 'This scope is already unlocked — reload before trying again.'
            : 'This scope is already locked — reload before trying again.',
          { current_state: currentlyUnlocked ? 'unlocked' : 'locked' },
        );
      }

      const [row] = await tx
        .insert(performanceCycleUnlock)
        .values({
          tenant_id: session.tenant_id,
          review_month: input.month,
          scope_kind: input.scope_kind,
          scope_id: scopeId,
          action,
          reason,
          actor_person_id: session.person_id,
          actor_user_id: session.user_id,
        })
        .returning();

      entry = toEntry(row as UnlockRow);

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.performance_cycle',
        aggregateId: `${input.month}:${input.scope_kind}:${scopeId ?? 'all'}`,
        eventType:
          action === 'unlock'
            ? 'people.performance.cycle.unlocked'
            : 'people.performance.cycle.relocked',
        eventVersion: 1,
        payload: {
          month: input.month,
          scope_kind: input.scope_kind,
          scope_id: scopeId,
          reason,
          actor_user_id: session.user_id,
        },
      });
    },
  );

  // withEmit resolves only after the tx commits; entry is always assigned on success.
  return entry as CycleUnlockEntry;
}

/** PMO manually unlocks a review cycle scope (AC1). */
export function unlockCycle(
  session: SessionScope,
  input: CycleUnlockInput,
): Promise<CycleUnlockEntry> {
  return applyCycleUnlockAction(session, input, 'unlock');
}

/** PMO re-locks a previously unlocked scope (AC1). */
export function relockCycle(
  session: SessionScope,
  input: CycleUnlockInput,
): Promise<CycleUnlockEntry> {
  return applyCycleUnlockAction(session, input, 'relock');
}

/** Immutable unlock/relock audit trail for a review month, newest first (AC4). */
export async function listCycleUnlocks(
  session: SessionScope,
  month: string,
): Promise<CycleUnlockLog> {
  requirePermission(session, 'people.performance.read_org');
  const rows = await peopleDb()
    .select()
    .from(performanceCycleUnlock)
    .where(
      and(
        eq(performanceCycleUnlock.tenant_id, session.tenant_id),
        eq(performanceCycleUnlock.review_month, month),
      ),
    )
    .orderBy(desc(performanceCycleUnlock.created_at), desc(performanceCycleUnlock.id));
  return { month, entries: rows.map(toEntry) };
}
