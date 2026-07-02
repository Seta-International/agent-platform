import type { SessionScope } from '@seta/core';
import { listRecruiterAccountIds } from '@seta/pm';
import {
  decisionPredicate,
  getDefaultRegistry,
  IMPLICIT_PERMISSIONS,
  resolveScope,
  type ScopePlan,
  scopeDecision,
} from '@seta/shared-rbac';
import { inArray, type SQL, sql } from 'drizzle-orm';
import { application, requisition } from '../db/schema.ts';

async function buildScope(
  session: SessionScope,
  permission: string,
  plan: (ids: string[]) => ScopePlan,
): Promise<SQL | null> {
  const scope = resolveScope(
    getDefaultRegistry(),
    session.assignments,
    IMPLICIT_PERMISSIONS,
    permission,
  );
  if (scope.kind === 'tenant') return null;
  const ids = session.worker_id
    ? await listRecruiterAccountIds(session.worker_id, session.tenant_id)
    : [];
  return decisionPredicate(
    scopeDecision(scope, plan(ids), { userId: session.user_id, tenantId: session.tenant_id }),
  );
}

/**
 * Row-scope predicate for `hiring.requisition` reads. SECURITY-CRITICAL.
 *
 * Returns `null` when the viewer's `hiring.requisition.read` scope resolves to tenant-wide
 * (manager/viewer personas — preserves existing behavior). Otherwise a predicate matching a
 * requisition row iff the viewer owns it (`owner_user_id`) or is an assigned recruiter on its
 * account (`pm.account_recruiter`, resolved via `@seta/pm`). Null-safe on `session.worker_id`:
 * a scoped viewer with no worker link sees only requisitions they own.
 */
export function buildRequisitionScope(session: SessionScope): Promise<SQL | null> {
  return buildScope(session, 'hiring.requisition.read', (ids) => ({
    relationships: [
      () => sql`${requisition.owner_user_id} = ${session.user_id}`,
      () => (ids.length > 0 ? inArray(requisition.account_id, ids) : null),
    ],
  }));
}

/**
 * Row-scope predicate for `hiring.application` reads (candidate board, candidate detail,
 * talent pool). SECURITY-CRITICAL. Same arms as `buildRequisitionScope`, expressed as a
 * requisition-id subquery so it composes against any query filtering on
 * `application.requisition_id`.
 */
export function buildCandidateScope(session: SessionScope): Promise<SQL | null> {
  return buildScope(session, 'hiring.candidate.read', (ids) => ({
    relationships: [
      () =>
        sql`${application.requisition_id} IN (SELECT ${requisition.id} FROM ${requisition}
          WHERE ${requisition.tenant_id} = ${session.tenant_id} AND ${requisition.owner_user_id} = ${session.user_id})`,
      () =>
        ids.length > 0
          ? sql`${application.requisition_id} IN (SELECT ${requisition.id} FROM ${requisition}
              WHERE ${requisition.tenant_id} = ${session.tenant_id} AND ${inArray(requisition.account_id, ids)})`
          : null,
    ],
  }));
}
