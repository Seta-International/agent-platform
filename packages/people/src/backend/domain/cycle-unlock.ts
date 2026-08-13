import type { SessionScope } from '@seta/core';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { performanceCycleUnlock } from '../db/schema.ts';

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
