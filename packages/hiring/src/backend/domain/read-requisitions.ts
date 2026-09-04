import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { hiringDb } from '../db/client.ts';
import {
  accountProjection,
  application,
  candidate,
  opening,
  projectProjection,
  REQUISITION_STATUS,
  requisition,
  requisitionJdSection,
  requisitionSkill,
} from '../db/schema.ts';
import { HiringError, requirePermission } from '../rbac.ts';
import { buildRequisitionScope } from './scope.ts';

export interface RequisitionSkillSummary {
  skill_name: string;
  min_level: number | null;
}

export interface RequisitionApplicantSummary {
  name: string;
  role: string | null;
  applied_date: string;
  stage: string;
  kind: string;
  // Application status (active/hired/rejected/transferred/cancelled) — without it the UI
  // renders a terminal applicant's last stage chip as if they were still in the pipeline.
  status: string;
}

export interface RequisitionListRow {
  id: string;
  title: string;
  role_title: string | null;
  account_id: string | null;
  account_name: string | null;
  project_id: string | null;
  project_name: string | null;
  grade: string | null;
  kind: string;
  approval_status: string;
  stage: string;
  status: string;
  note: string | null;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  skills: RequisitionSkillSummary[];
  openings_total: number;
  openings_open: number;
  openings_filled: number;
  applicants_count: number;
  applicants_internal: number;
  applicants_external: number;
  // Hired applicants are terminal (not `active`), so they're excluded from `applicants`/counts
  // above; count them separately so the list's pipeline cell can show a Hired figure.
  hired_count: number;
  applicants: RequisitionApplicantSummary[];
  version: number;
}

const REQUISITION_LIST_COLUMNS = {
  id: requisition.id,
  title: requisition.title,
  role_title: requisition.role_title,
  account_id: requisition.account_id,
  account_name: accountProjection.name,
  project_id: requisition.project_id,
  project_name: projectProjection.name,
  grade: requisition.grade,
  kind: requisition.kind,
  approval_status: requisition.approval_status,
  stage: requisition.stage,
  status: requisition.status,
  note: requisition.note,
  start_date: requisition.start_date,
  due_date: requisition.due_date,
  created_at: sql<string>`${requisition.created_at}::text`,
  // Bumped whenever the row is written, including by holdRequisition — used to show
  // "Paused since {updated_at}" on the board card while on_hold.
  updated_at: sql<string>`${requisition.updated_at}::text`,
  // Skills are surfaced on the list card (chips); aggregate them inline rather than
  // forcing a second round-trip to the detail endpoint.
  skills: sql<
    RequisitionSkillSummary[]
  >`(SELECT COALESCE(json_agg(json_build_object('skill_name', rs.skill_name, 'min_level', rs.min_level) ORDER BY rs.skill_name), '[]'::json) FROM hiring.requisition_skill rs WHERE rs.requisition_id = "hiring"."requisition"."id")`,
  openings_total: sql<number>`(SELECT count(*)::int FROM hiring.opening o WHERE o.requisition_id = "hiring"."requisition"."id" AND o.status != 'cancelled')`,
  openings_open: sql<number>`(SELECT count(*)::int FROM hiring.opening o WHERE o.requisition_id = "hiring"."requisition"."id" AND o.status = 'open')`,
  openings_filled: sql<number>`(SELECT count(*)::int FROM hiring.opening o WHERE o.requisition_id = "hiring"."requisition"."id" AND o.status = 'filled')`,
  // Pipeline truth only: rejected/transferred/cancelled applications are closed history
  // and must not inflate the card's counts, stage buckets, or progress line (bug: a
  // candidate moved to another role kept appearing on the old role's card).
  applicants_count: sql<number>`(SELECT count(*)::int FROM hiring.application a WHERE a.requisition_id = "hiring"."requisition"."id" AND a.status = 'active')`,
  applicants_internal: sql<number>`(SELECT count(*)::int FROM hiring.application a WHERE a.requisition_id = "hiring"."requisition"."id" AND a.kind = 'internal' AND a.status = 'active')`,
  applicants_external: sql<number>`(SELECT count(*)::int FROM hiring.application a WHERE a.requisition_id = "hiring"."requisition"."id" AND a.kind = 'external' AND a.status = 'active')`,
  // Hired candidates for this requisition — a terminal status, so it isn't part of the active
  // pipeline counts/buckets above; shown as a separate figure on the list's pipeline cell.
  hired_count: sql<number>`(SELECT count(*)::int FROM hiring.application a WHERE a.requisition_id = "hiring"."requisition"."id" AND a.status = 'hired')`,
  // Top applicants surfaced inline on the card; candidate lives in the same hiring
  // schema, so this join stays module-local.
  applicants: sql<
    RequisitionApplicantSummary[]
  >`(SELECT COALESCE(json_agg(json_build_object('name', c.name, 'role', c.seniority, 'applied_date', a.created_at, 'stage', a.stage, 'kind', a.kind, 'status', a.status) ORDER BY a.created_at), '[]'::json) FROM hiring.application a JOIN hiring.candidate c ON c.id = a.candidate_id WHERE a.requisition_id = "hiring"."requisition"."id" AND a.status = 'active')`,
  version: requisition.version,
};

function requisitionListQuery() {
  return (
    hiringDb()
      .select(REQUISITION_LIST_COLUMNS)
      .from(requisition)
      // 1:1 name lookups → plain leftJoin (projection PK is unique, so no row fan-out).
      .leftJoin(accountProjection, eq(accountProjection.account_id, requisition.account_id))
      .leftJoin(projectProjection, eq(projectProjection.project_id, requisition.project_id))
      // Postgres gives no row-order guarantee without ORDER BY — newest first is what both
      // the list and board views expect.
      .orderBy(desc(requisition.created_at))
  );
}

export async function listRequisitions(session: SessionScope): Promise<RequisitionListRow[]> {
  requirePermission(session, 'hiring.requisition.read');
  const conds = [tenantScoped(requisition.tenant_id, session)];
  const scope = await buildRequisitionScope(session);
  if (scope) conds.push(scope);
  return requisitionListQuery().where(and(...conds));
}

// The board carries the same lifecycle statuses as the list view — open, on_hold, filled and
// cancelled — so switching between Board and List preserves the dataset and dashboard stats
// (FUT-878). Every requisition a viewer can read is shown; status pills tell them apart.
const BOARD_STATUSES = REQUISITION_STATUS;

export interface OpenRequisitionsBoard {
  scope: 'all' | 'scoped';
  scoped_account_names: string[];
  scoped_project_names: string[];
  requisitions: RequisitionListRow[];
}

/**
 * FUT-326/327/328/330 — the open-positions board.
 *
 * A requisition is a hiring-owned resource, so access is gated by `hiring.requisition.read`.
 * Row scoping delegates to `buildRequisitionScope` (the unified RBAC scope layer, FUT-378):
 * a tenant-wide `hiring.requisition.read` grant sees every board requisition company-wide;
 * a scoped grant is limited to requisitions the viewer owns, is an assigned
 * recruiter or the AM on its account (via `@seta/pm.listAccountIdsManagedBy`, FUT-330;
 * AM ownership resolves against `pm.account` directly, not a local projection), or owns
 * the project of as EM/TL/PM (FUT-328).
 * `scoped_account_names`/`scoped_project_names` are derived from the returned rows rather
 * than a second lookup, so they always match what's actually shown.
 */
export async function listOpenRequisitions(session: SessionScope): Promise<OpenRequisitionsBoard> {
  requirePermission(session, 'hiring.requisition.read');

  const conds = [
    tenantScoped(requisition.tenant_id, session),
    inArray(requisition.status, BOARD_STATUSES),
  ];
  const scope = await buildRequisitionScope(session);
  if (scope) conds.push(scope);
  const requisitions = await requisitionListQuery().where(and(...conds));

  if (!scope) {
    return { scope: 'all', scoped_account_names: [], scoped_project_names: [], requisitions };
  }

  const scoped_account_names = Array.from(
    new Set(requisitions.map((r) => r.account_name).filter((n): n is string => n != null)),
  ).sort();
  const scoped_project_names = Array.from(
    new Set(requisitions.map((r) => r.project_name).filter((n): n is string => n != null)),
  ).sort();
  return { scope: 'scoped', scoped_account_names, scoped_project_names, requisitions };
}

export interface RequisitionDetail {
  requisition: typeof requisition.$inferSelect;
  account_name: string | null;
  project_name: string | null;
  openings: (typeof opening.$inferSelect)[];
  jd_sections: (typeof requisitionJdSection.$inferSelect)[];
  skills: (typeof requisitionSkill.$inferSelect)[];
  /** All applications including closed history (rejected/transferred/…) — the UI counts
   * only active ones and renders the rest as a dimmed past-applicants trail. */
  applicants: (typeof application.$inferSelect & {
    candidate_name: string | null;
    candidate_seniority: string | null;
  })[];
  has_applied: boolean;
  user_application_id: string | null;
}

export async function getRequisition(input: {
  requisition_id: string;
  session: SessionScope;
}): Promise<RequisitionDetail> {
  const { session, requisition_id } = input;
  requirePermission(session, 'hiring.requisition.read');
  const conds = [eq(requisition.id, requisition_id), tenantScoped(requisition.tenant_id, session)];
  const scope = await buildRequisitionScope(session);
  if (scope) conds.push(scope);
  const [row] = await hiringDb()
    .select({
      requisition,
      account_name: accountProjection.name,
      project_name: projectProjection.name,
    })
    .from(requisition)
    .leftJoin(accountProjection, eq(accountProjection.account_id, requisition.account_id))
    .leftJoin(projectProjection, eq(projectProjection.project_id, requisition.project_id))
    .where(and(...conds))
    .limit(1);
  // Invisible-through-scope rows return NOT_FOUND, never FORBIDDEN — don't leak existence.
  if (!row) throw new HiringError('NOT_FOUND', 'requisition not found');
  const [openings, jd_sections, skills, applicants] = await Promise.all([
    hiringDb().select().from(opening).where(eq(opening.requisition_id, requisition_id)),
    hiringDb()
      .select()
      .from(requisitionJdSection)
      .where(eq(requisitionJdSection.requisition_id, requisition_id)),
    hiringDb()
      .select()
      .from(requisitionSkill)
      .where(eq(requisitionSkill.requisition_id, requisition_id)),
    hiringDb()
      .select({
        ...getTableColumns(application),
        candidate_name: candidate.name,
        candidate_seniority: candidate.seniority,
        candidate_email: candidate.contact,
      })
      .from(application)
      .leftJoin(candidate, eq(candidate.id, application.candidate_id))
      .where(eq(application.requisition_id, requisition_id)),
  ]);

  const userEmail = session.email.toLowerCase().trim();
  const userApp = applicants.find((app) => {
    if (app.status !== 'active' && app.status !== 'hired') return false;
    if (session.person_id && app.person_id === session.person_id) return true;
    const contactEmail = (app.candidate_email as { personal_email?: string } | null)
      ?.personal_email;
    return contactEmail?.toLowerCase().trim() === userEmail;
  });

  return {
    requisition: row.requisition,
    account_name: row.account_name,
    project_name: row.project_name,
    openings,
    jd_sections,
    skills,
    applicants: applicants.map(({ candidate_email, ...rest }) => rest),
    has_applied: !!userApp,
    user_application_id: userApp ? userApp.id : null,
  };
}

export interface AccountOption {
  account_id: string;
  name: string;
}

export interface ProjectOption {
  project_id: string;
  account_id: string;
  name: string;
  date_to: string | null;
}

// Backing the New Requisition account/project pickers — same local read-models the board and
// list views already join against, tenant-scoped, ordered for a stable dropdown.
export async function listAccounts(session: SessionScope): Promise<AccountOption[]> {
  requirePermission(session, 'hiring.requisition.read');
  return hiringDb()
    .select({ account_id: accountProjection.account_id, name: accountProjection.name })
    .from(accountProjection)
    .where(eq(accountProjection.tenant_id, session.tenant_id))
    .orderBy(accountProjection.name);
}

export async function listProjects(
  session: SessionScope,
  accountId?: string,
): Promise<ProjectOption[]> {
  requirePermission(session, 'hiring.requisition.read');
  return hiringDb()
    .select({
      project_id: projectProjection.project_id,
      account_id: projectProjection.account_id,
      name: projectProjection.name,
      date_to: projectProjection.date_to,
    })
    .from(projectProjection)
    .where(
      accountId
        ? and(
            eq(projectProjection.tenant_id, session.tenant_id),
            eq(projectProjection.account_id, accountId),
          )
        : eq(projectProjection.tenant_id, session.tenant_id),
    )
    .orderBy(projectProjection.name);
}
