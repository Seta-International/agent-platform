import type { SessionScope } from '@seta/core';
import { listUserIdsByRoleSlugs } from '@seta/identity';
import { listAccountManagers } from '@seta/pm';
import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import type {
  MoraleProjectOption,
  MoraleRecipientCandidate,
  MoraleRecipientGroup,
  MoraleRecipientsForm,
  MoraleSelectableTag,
} from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import {
  accountProjection,
  employmentPeriod,
  person,
  projectProjection,
  userProjection,
  workerAllocationProjection,
} from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';

/**
 * Role slugs that stand in for each recipient group. Exported because the reviewer side
 * (FUT-786) has to recognise exactly the same holders it delivers to — two lists would
 * eventually let someone receive notes they cannot open.
 */
export const HR_ROLES = ['people.manager'];
export const PMO_ROLES = ['pm.pmo'];
export const BOD_ROLES = ['pm.bod'];

/**
 * One checkbox per person: someone who is both the AM on your account and a PMO would
 * otherwise appear in two groups and be selectable twice, leaving the stored
 * `recipient_tag` ambiguous. The closest relationship wins.
 */
const TAG_PRIORITY = ['tl', 'am', 'pmo', 'bod'] as const;

/** Shown in place of candidates when a role applies to this sender but nobody qualifies. */
const NO_CANDIDATES_REASON: Record<MoraleSelectableTag, string> = {
  tl: 'No team lead is assigned to your project yet.',
  am: 'No account manager is assigned to your account yet.',
  pmo: 'No PMO is assigned to your organisation yet.',
  bod: 'No board member is available.',
};

export interface EligiblePerson {
  person_id: string;
  full_name: string | null;
  org_unit_id: string | null;
}

/**
 * Narrows a candidate set to people who can actually still receive a note:
 * record alive, employment open, login active, and never the sender themselves.
 * An open `employment_period` (end_date IS NULL) is this schema's "still employed".
 */
async function eligiblePersons(
  tenantId: string,
  senderPersonId: string,
  personIds: string[],
): Promise<EligiblePerson[]> {
  if (personIds.length === 0) return [];
  return peopleDb()
    .select({
      person_id: person.id,
      full_name: person.full_name,
      org_unit_id: person.org_unit_id,
    })
    .from(person)
    .innerJoin(
      employmentPeriod,
      and(eq(employmentPeriod.person_id, person.id), isNull(employmentPeriod.end_date)),
    )
    .innerJoin(
      userProjection,
      and(eq(userProjection.person_id, person.id), isNull(userProjection.deactivated_at)),
    )
    .where(
      and(
        eq(person.tenant_id, tenantId),
        inArray(person.id, [...new Set(personIds)]),
        ne(person.id, senderPersonId),
        isNull(person.deleted_at),
      ),
    );
}

/** person_ids behind a set of role slugs, via the identity → people user projection. */
async function personIdsForRoles(tenantId: string, roleSlugs: string[]): Promise<string[]> {
  const userIds = await listUserIdsByRoleSlugs(tenantId, roleSlugs);
  if (userIds.length === 0) return [];
  const rows = await peopleDb()
    .select({ person_id: userProjection.person_id })
    .from(userProjection)
    .where(and(eq(userProjection.tenant_id, tenantId), inArray(userProjection.user_id, userIds)));
  return rows.map((r) => r.person_id);
}

/**
 * HR always receives every note, so it is resolved server-side and never offered to
 * the client — the sender cannot deselect what they were never shown, and the HR
 * roster is never disclosed to them.
 */
export async function resolveMoraleHrRecipients(
  tenantId: string,
  senderPersonId: string,
): Promise<EligiblePerson[]> {
  return eligiblePersons(tenantId, senderPersonId, await personIdsForRoles(tenantId, HR_ROLES));
}

/** Joins the eligibility filter to the per-person context collected while scoping. */
function toCandidates(
  people: EligiblePerson[],
  contextByPerson: Map<string, Set<string>>,
): MoraleRecipientCandidate[] {
  return people.map((p) => {
    const ctx = [...(contextByPerson.get(p.person_id) ?? [])];
    return {
      person_id: p.person_id,
      full_name: p.full_name,
      context: ctx.length > 0 ? ctx.join(', ') : null,
    };
  });
}

/**
 * The roles this sender may route a note to, and who sits in each.
 *
 * Scoping follows the reporting line rather than the org chart at large: TL and AM are
 * only offered when the sender actually shares a project (or that project's account)
 * with them, while PMO and BoD are company-wide and unrestricted. A Team Lead is never
 * offered the TL group — their escalation path starts at AM.
 *
 * Capacity comes from live allocations, not from a role grant: leading a project makes
 * you a TL here, being allocated to one makes you a Member, and someone doing both gets
 * the union. Self-send is filtered rather than special-cased, so a lead never has to be
 * excluded from their own team's list by name.
 *
 * `requestedProjectId` narrows TL and AM to one project. It only matters for a sender on
 * several: with one project there is nothing to choose, and with none there is no TL or
 * AM to scope. PMO and BoD ignore it entirely — they are granted at tenant scope
 * (`pm.pmo` / `pm.bod`), so they are the same people on every project and switching
 * projects must not appear to swap them out.
 */
export async function resolveMoraleRecipients(
  session: SessionScope,
  senderPersonId: string | null,
  requestedProjectId?: string | null,
): Promise<MoraleRecipientsForm> {
  requirePermission(session, 'people.performance.read');

  // A login with no employee record has no reporting line to resolve and nobody to
  // attribute a note to — not an error. Rejecting here would replace the screen's
  // explanation with a retry banner that retrying can never clear.
  if (!senderPersonId) {
    return { can_submit: false, projects: [], selected_project_id: null, groups: [] };
  }

  const tenantId = session.tenant_id;
  const db = peopleDb();

  // Morale can be raised any time, so current allocations define the audience — no
  // cycle window applies here the way it does to Performance. One query covers both
  // capacities: rows where the sender is the worker, and rows where they are the lead.
  const allocations = await db
    .selectDistinct({
      project_id: workerAllocationProjection.project_id,
      account_id: workerAllocationProjection.account_id,
      lead_person_id: workerAllocationProjection.lead_person_id,
      person_id: workerAllocationProjection.person_id,
      project_name: projectProjection.name,
      account_name: accountProjection.name,
    })
    .from(workerAllocationProjection)
    .leftJoin(
      projectProjection,
      eq(projectProjection.project_id, workerAllocationProjection.project_id),
    )
    .leftJoin(
      accountProjection,
      eq(accountProjection.account_id, workerAllocationProjection.account_id),
    )
    .where(
      and(
        eq(workerAllocationProjection.tenant_id, tenantId),
        eq(workerAllocationProjection.active, true),
        or(
          eq(workerAllocationProjection.person_id, senderPersonId),
          eq(workerAllocationProjection.lead_person_id, senderPersonId),
        ),
      ),
    );

  // Every project the sender touches in either capacity, name-sorted so the picker is
  // stable across reloads. Deduplicated by id: sitting on a project *and* leading it is
  // two allocation rows but one choice.
  const projectsById = new Map<string, MoraleProjectOption>();
  for (const a of allocations) {
    if (!projectsById.has(a.project_id)) {
      projectsById.set(a.project_id, { project_id: a.project_id, name: a.project_name });
    }
  }
  const projects = [...projectsById.values()].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? ''),
  );

  /**
   * One project means the choice is already made, so a stale or wrong `project_id` from
   * the client is ignored rather than rejected — there is only one right answer and the
   * server knows it. Several projects and no valid pick leaves this null: TL and AM are
   * genuinely undetermined until the sender chooses, which the client renders as the
   * project prompt rather than as an empty recipient list.
   */
  const selectedProjectId =
    projects.length === 1
      ? (projects[0]?.project_id ?? null)
      : requestedProjectId && projectsById.has(requestedProjectId)
        ? requestedProjectId
        : null;

  // Nobody is barred from submitting: an HR or BoD manager with no allocation still
  // reaches PMO and BoD, and their note is filed against no project at all.
  const scoped = selectedProjectId
    ? allocations.filter((a) => a.project_id === selectedProjectId)
    : [];
  const asMember = scoped.filter((a) => a.person_id === senderPersonId);

  // TL is offered to Members only, scoped to the leads of the projects they sit on.
  const tlContext = new Map<string, Set<string>>();
  for (const a of asMember) {
    if (!a.lead_person_id) continue;
    const set = tlContext.get(a.lead_person_id) ?? new Set<string>();
    if (a.project_name) set.add(a.project_name);
    tlContext.set(a.lead_person_id, set);
  }

  // AM covers both capacities, but only within the chosen project — an AM reachable
  // through a *different* project is not part of this note's escalation path.
  const accountNames = new Map<string, string | null>();
  for (const a of scoped) accountNames.set(a.account_id, a.account_name);

  const amContext = new Map<string, Set<string>>();
  for (const a of await listAccountManagers(tenantId)) {
    if (!a.am_person_id || !accountNames.has(a.account_id)) continue;
    const set = amContext.get(a.am_person_id) ?? new Set<string>();
    const name = accountNames.get(a.account_id);
    if (name) set.add(name);
    amContext.set(a.am_person_id, set);
  }

  const [tlPeople, amPeople, pmoPeople, bodPeople] = await Promise.all([
    asMember.length > 0 ? eligiblePersons(tenantId, senderPersonId, [...tlContext.keys()]) : [],
    eligiblePersons(tenantId, senderPersonId, [...amContext.keys()]),
    eligiblePersons(tenantId, senderPersonId, await personIdsForRoles(tenantId, PMO_ROLES)),
    eligiblePersons(tenantId, senderPersonId, await personIdsForRoles(tenantId, BOD_ROLES)),
  ]);

  const empty = new Map<string, Set<string>>();
  const byTag: Record<MoraleSelectableTag, MoraleRecipientCandidate[]> = {
    tl: toCandidates(tlPeople, tlContext),
    am: toCandidates(amPeople, amContext),
    pmo: toCandidates(pmoPeople, empty),
    bod: toCandidates(bodPeople, empty),
  };

  const seen = new Set<string>();
  const groups: MoraleRecipientGroup[] = [];
  for (const tag of TAG_PRIORITY) {
    // TL and AM hang off a project, so with none in scope they are absent rather than
    // empty — "does not apply" instead of "nobody qualifies". That covers both the
    // projectless sender and the one who has yet to pick among several.
    if ((tag === 'tl' || tag === 'am') && !selectedProjectId) continue;
    // A Team Lead escalates past their own level: no TL group at all, as opposed to an
    // empty one, so the UI drops the checkbox instead of showing it greyed out.
    if (tag === 'tl' && asMember.length === 0) continue;
    const candidates = byTag[tag].filter((c) => {
      if (seen.has(c.person_id)) return false;
      seen.add(c.person_id);
      return true;
    });
    groups.push({
      tag,
      candidates,
      unavailable_reason: candidates.length === 0 ? NO_CANDIDATES_REASON[tag] : null,
    });
  }

  return { can_submit: true, projects, selected_project_id: selectedProjectId, groups };
}
