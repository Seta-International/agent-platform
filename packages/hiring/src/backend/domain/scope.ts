import type { SessionScope } from '@seta/core';
import { listAccountIdsManagedBy, listProjectIdsOwnedBy, listRecruiterAccountIds } from '@seta/pm';
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
  plan: (accountIds: string[], projectIds: string[]) => ScopePlan,
  opts: { includeProjects?: boolean } = {},
): Promise<SQL | null> {
  const scope = resolveScope(
    getDefaultRegistry(),
    session.assignments,
    IMPLICIT_PERMISSIONS,
    permission,
  );
  if (scope.kind === 'tenant') return null;
  const accountIds = session.person_id
    ? Array.from(
        new Set([
          ...(await listRecruiterAccountIds(session.person_id, session.tenant_id)),
          ...(await listAccountIdsManagedBy(session.person_id, session.tenant_id)),
        ]),
      )
    : [];
  const projectIds =
    opts.includeProjects && session.person_id
      ? await listProjectIdsOwnedBy(session.person_id, session.tenant_id)
      : [];
  return decisionPredicate(
    scopeDecision(scope, plan(accountIds, projectIds), {
      userId: session.user_id,
      tenantId: session.tenant_id,
    }),
  );
}

/**
 * Row-scope predicate for `hiring.requisition` reads. SECURITY-CRITICAL.
 *
 * Returns `null` when the viewer's `hiring.requisition.read` scope resolves to tenant-wide
 * (manager/viewer personas — preserves existing behavior). Otherwise a predicate matching a
 * requisition row iff the viewer owns it (`owner_user_id`), is an assigned recruiter or the AM
 * on its account (`@seta/pm.listRecruiterAccountIds` / `listAccountIdsManagedBy`, FUT-330), or
 * owns its project as EM/TL/PM (`@seta/pm.listProjectIdsOwnedBy`, FUT-328). Null-safe on
 * `session.person_id`: a scoped viewer with no worker link sees only requisitions they own.
 */
export function buildRequisitionScope(session: SessionScope): Promise<SQL | null> {
  return buildScope(
    session,
    'hiring.requisition.read',
    (accountIds, projectIds) => ({
      relationships: [
        () => sql`${requisition.owner_user_id} = ${session.user_id}`,
        () => (accountIds.length > 0 ? inArray(requisition.account_id, accountIds) : null),
        () => (projectIds.length > 0 ? inArray(requisition.project_id, projectIds) : null),
      ],
    }),
    { includeProjects: true },
  );
}

/**
 * Row-scope predicate for `hiring.application` reads (candidate board, candidate detail,
 * talent pool). SECURITY-CRITICAL. Same arms as `buildRequisitionScope` — owner, assigned
 * recruiter/AM account, or owned project as EM/TL/PM (`@seta/pm.listProjectIdsOwnedBy`, FUT-337) —
 * expressed as a requisition-id subquery so it composes against any query filtering on
 * `application.requisition_id`.
 */
export function buildCandidateScope(session: SessionScope): Promise<SQL | null> {
  return buildScope(
    session,
    'hiring.candidate.read',
    (accountIds, projectIds) => ({
      relationships: [
        () =>
          sql`${application.requisition_id} IN (SELECT ${requisition.id} FROM ${requisition}
            WHERE ${requisition.tenant_id} = ${session.tenant_id} AND ${requisition.owner_user_id} = ${session.user_id})`,
        () =>
          accountIds.length > 0
            ? sql`${application.requisition_id} IN (SELECT ${requisition.id} FROM ${requisition}
                WHERE ${requisition.tenant_id} = ${session.tenant_id} AND ${inArray(requisition.account_id, accountIds)})`
            : null,
        () =>
          projectIds.length > 0
            ? sql`${application.requisition_id} IN (SELECT ${requisition.id} FROM ${requisition}
                WHERE ${requisition.tenant_id} = ${session.tenant_id} AND ${inArray(requisition.project_id, projectIds)})`
            : null,
      ],
    }),
    { includeProjects: true },
  );
}
