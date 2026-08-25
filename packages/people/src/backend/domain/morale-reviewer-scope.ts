import type { SessionScope } from '@seta/core';
import { listAccountIdsManagedBy } from '@seta/pm';
import { and, eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { workerAllocationProjection } from '../db/schema.ts';
import { BOD_ROLES, HR_ROLES, PMO_ROLES } from './resolve-morale-recipients.ts';

/** Roles whose remit is the whole organisation, so their trend is too. */
const ORG_WIDE_ROLES = new Set([...HR_ROLES, ...PMO_ROLES, ...BOD_ROLES]);

export type MoraleTrendScope =
  | { kind: 'org' }
  | { kind: 'account'; account_ids: string[] }
  | { kind: 'project'; project_ids: string[] };

export interface MoraleReviewerScope {
  /** Whether this caller can be a morale recipient at all. Gates the two manager tabs. */
  can_review: boolean;
  /** Null exactly when `can_review` is false. */
  trend: MoraleTrendScope | null;
}

/**
 * What a viewer of the manager tabs is entitled to (FUT-786 AC1/AC5).
 *
 * Two separate questions, answered together because they come from the same facts:
 *
 * - *May I open the tabs at all?* — yes for anyone who can be chosen as a recipient: HR,
 *   PMO and BoD by role grant, an Account Manager by owning an account, a Team Lead by
 *   leading a project. The inbox itself is still filtered per note, so this only decides
 *   whether the tabs exist; it never widens what is inside them.
 * - *Whose morale does the trend average?* — the org for the org-wide roles, the accounts
 *   an AM owns, the projects a TL leads.
 *
 * Widest wins when someone holds several capacities: an HR who also leads a project reads
 * the organisation, not their team. Narrowing them to their team would hide from HR
 * exactly the picture HR is accountable for.
 *
 * Note that the trend scope is deliberately *not* the same set as the inbox: the inbox is
 * the notes chosen for you personally, while the trend is an anonymous aggregate over a
 * group you are responsible for. A TL sees every rating on their project, including from
 * people who never sent them a note, because no individual is identifiable in it.
 */
export async function resolveMoraleReviewerScope(
  session: SessionScope,
): Promise<MoraleReviewerScope> {
  if (session.role_summary.roles.some((slug) => ORG_WIDE_ROLES.has(slug))) {
    return { can_review: true, trend: { kind: 'org' } };
  }

  // A login with no employee record holds neither delivery capacity — there is nothing to
  // scope by and nothing addressed to them.
  const personId = session.person_id;
  if (!personId) return { can_review: false, trend: null };

  const accountIds = await listAccountIdsManagedBy(personId, session.tenant_id);
  if (accountIds.length > 0) {
    return { can_review: true, trend: { kind: 'account', account_ids: accountIds } };
  }

  const led = await peopleDb()
    .selectDistinct({ project_id: workerAllocationProjection.project_id })
    .from(workerAllocationProjection)
    .where(
      and(
        eq(workerAllocationProjection.tenant_id, session.tenant_id),
        eq(workerAllocationProjection.active, true),
        eq(workerAllocationProjection.lead_person_id, personId),
      ),
    );

  if (led.length > 0) {
    return {
      can_review: true,
      trend: { kind: 'project', project_ids: led.map((r) => r.project_id) },
    };
  }

  return { can_review: false, trend: null };
}
