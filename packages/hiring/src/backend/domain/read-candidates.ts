import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { hiringDb } from '../db/client.ts';
import {
  application,
  candidate,
  candidateEvent,
  candidateSkill,
  requisition,
  requisitionSkill,
} from '../db/schema.ts';
import { HiringError, requirePermission } from '../rbac.ts';
import { computeFit, type FitResult } from './fit.ts';
import { buildCandidateScope, buildRequisitionScope } from './scope.ts';

export interface CandidateApplication {
  application_id: string;
  requisition_id: string;
  requisition_title: string;
  requisition_status: string;
  account_id: string | null;
  stage: string;
  status: string;
  rating: number | null;
  tags: string[];
  version: number;
  applied_at: Date;
  note: string | null;
  fit: FitResult;
}

export interface CandidateSkillBrief {
  skill_id: string;
  skill_name: string;
  level: number | null;
}

export interface CandidateListRow {
  application_id: string;
  candidate_id: string;
  name: string;
  seniority: string | null;
  source: string | null;
  requisition_id: string;
  requisition_title: string;
  requisition_status: string;
  stage: string;
  status: string;
  rating: number | null;
  version: number;
  applied_at: Date;
  skills: CandidateSkillBrief[];
  // The requisition's required skills (name + min level) — powers the card's "n/m skills" hover,
  // the same list the detail drawer shows. `level` carries requisition_skill.min_level.
  required_skills: CandidateSkillBrief[];
  fit: FitResult;
}

async function fitFor(
  session: SessionScope,
  reqIds: string[],
  candIds: string[],
): Promise<{
  // skill_name rides along so callers can list a requisition's required skills (the card/detail
  // "n/m skills" tooltip); computeFit reads only skill_id/min_level, so the extra field is inert.
  reqSkills: Map<string, { skill_id: string; skill_name: string; min_level: number | null }[]>;
  candSkills: Map<string, CandidateSkillBrief[]>;
}> {
  const reqSkills = new Map<
    string,
    { skill_id: string; skill_name: string; min_level: number | null }[]
  >();
  const candSkills = new Map<string, CandidateSkillBrief[]>();
  if (reqIds.length) {
    const rs = await hiringDb()
      .select({
        requisition_id: requisitionSkill.requisition_id,
        skill_id: requisitionSkill.skill_id,
        skill_name: requisitionSkill.skill_name,
        min_level: requisitionSkill.min_level,
      })
      .from(requisitionSkill)
      .where(
        and(
          inArray(requisitionSkill.requisition_id, reqIds),
          tenantScoped(requisitionSkill.tenant_id, session),
        ),
      );
    for (const r of rs) {
      const list = reqSkills.get(r.requisition_id) ?? [];
      list.push({
        skill_id: r.skill_id as string,
        skill_name: r.skill_name,
        min_level: r.min_level,
      });
      reqSkills.set(r.requisition_id, list);
    }
  }
  if (candIds.length) {
    const cs = await hiringDb()
      .select({
        candidate_id: candidateSkill.candidate_id,
        skill_id: candidateSkill.skill_id,
        skill_name: candidateSkill.skill_name,
        level: candidateSkill.level,
      })
      .from(candidateSkill)
      .where(
        and(
          inArray(candidateSkill.candidate_id, candIds),
          tenantScoped(candidateSkill.tenant_id, session),
        ),
      );
    for (const c of cs) {
      const list = candSkills.get(c.candidate_id) ?? [];
      list.push({ skill_id: c.skill_id, skill_name: c.skill_name, level: c.level });
      candSkills.set(c.candidate_id, list);
    }
  }
  return { reqSkills, candSkills };
}

// Shared read for the candidates board/list — one row per application, joined to candidate +
// requisition with fit computed. `statuses` narrows which application states come back so the
// same shape backs both the active board (active+hired) and the read-only Rejected column.
async function listApplicationRows(
  session: SessionScope,
  statuses: (typeof application.$inferSelect)['status'][],
): Promise<CandidateListRow[]> {
  const conds = [
    eq(application.kind, 'external'),
    inArray(application.status, statuses),
    tenantScoped(application.tenant_id, session),
    isNull(candidate.deleted_at),
  ];
  const scope = await buildCandidateScope(session);
  if (scope) conds.push(scope);
  const rows = await hiringDb()
    .select({
      application_id: application.id,
      candidate_id: application.candidate_id,
      name: candidate.name,
      seniority: candidate.seniority,
      source: candidate.source,
      requisition_id: application.requisition_id,
      requisition_title: requisition.title,
      requisition_status: requisition.status,
      stage: application.stage,
      status: application.status,
      rating: application.rating,
      version: application.version,
      applied_at: application.created_at,
    })
    .from(application)
    .innerJoin(candidate, eq(candidate.id, application.candidate_id))
    .innerJoin(requisition, eq(requisition.id, application.requisition_id))
    .where(and(...conds))
    // Without an explicit order, Postgres can return rows in a different physical order after
    // an UPDATE (e.g. a stage move) — the board would look like the dragged card "teleported".
    // Most-recently-moved first also means a card dropped into a column surfaces at its top.
    .orderBy(desc(application.updated_at));
  const { reqSkills, candSkills } = await fitFor(
    session,
    [...new Set(rows.map((r) => r.requisition_id))],
    [...new Set(rows.map((r) => r.candidate_id as string))],
  );
  return rows.map((r) => {
    const req = reqSkills.get(r.requisition_id) ?? [];
    return {
      ...r,
      candidate_id: r.candidate_id as string,
      skills: candSkills.get(r.candidate_id as string) ?? [],
      required_skills: req.map((s) => ({
        skill_id: s.skill_id,
        skill_name: s.skill_name,
        level: s.min_level,
      })),
      fit: computeFit(req, candSkills.get(r.candidate_id as string) ?? []),
    };
  });
}

// The board/list surface: the active pipeline plus hired. Terminal outcomes are read separately
// (listRejectedCandidates) so they never leak into the pipeline columns.
export async function listCandidates(session: SessionScope): Promise<CandidateListRow[]> {
  requirePermission(session, 'hiring.candidate.read');
  return listApplicationRows(session, ['active', 'hired']);
}

// Rejected applications only — backs the board's read-only "Rejected" column. Transferred and
// cancelled outcomes are deliberately excluded; "rejected" means an explicit reject decision.
export async function listRejectedCandidates(session: SessionScope): Promise<CandidateListRow[]> {
  requirePermission(session, 'hiring.candidate.read');
  return listApplicationRows(session, ['rejected']);
}

export interface CandidateStageCounts {
  new: number;
  screening: number;
  interview: number;
  offer: number;
  hired: number;
  cancelled: number;
}

// Purpose-built aggregate for the board's stat bar — kept separate from listCandidates so
// that query stays scoped to active+hired applications (what the board/list renders) while
// this one also counts rejected/transferred ("cancelled") without pulling those rows into
// the board's row set.
export async function getCandidateStageCounts(
  session: SessionScope,
): Promise<CandidateStageCounts> {
  requirePermission(session, 'hiring.candidate.read');
  const conds = [
    eq(application.kind, 'external'),
    tenantScoped(application.tenant_id, session),
    isNull(candidate.deleted_at),
  ];
  const scope = await buildCandidateScope(session);
  if (scope) conds.push(scope);
  const rows = await hiringDb()
    .select({
      status: application.status,
      stage: application.stage,
      count: sql<number>`count(*)::int`,
    })
    .from(application)
    .innerJoin(candidate, eq(candidate.id, application.candidate_id))
    .where(and(...conds))
    .groupBy(application.status, application.stage);

  const counts: CandidateStageCounts = {
    new: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    hired: 0,
    cancelled: 0,
  };
  for (const r of rows) {
    if (r.status === 'active') counts[r.stage as keyof typeof counts] += r.count;
    else if (r.status === 'hired') counts.hired += r.count;
    else if (r.status === 'rejected' || r.status === 'transferred' || r.status === 'cancelled')
      counts.cancelled += r.count;
  }
  return counts;
}

export interface CandidateDetail {
  candidate: typeof candidate.$inferSelect;
  skills: (typeof candidateSkill.$inferSelect)[];
  applications: CandidateApplication[];
  timeline: (typeof candidateEvent.$inferSelect)[];
}

export async function getCandidate(input: {
  candidate_id: string;
  session: SessionScope;
}): Promise<CandidateDetail> {
  const { session, candidate_id } = input;
  requirePermission(session, 'hiring.candidate.read');
  const scope = await buildCandidateScope(session);
  const candConds = [
    eq(candidate.id, candidate_id),
    tenantScoped(candidate.tenant_id, session),
    isNull(candidate.deleted_at),
  ];
  if (scope) {
    candConds.push(sql`EXISTS (SELECT 1 FROM ${application}
      WHERE ${application.candidate_id} = ${candidate.id}
        AND ${application.tenant_id} = ${session.tenant_id}
        AND (${scope}))`);
  }
  const [cand] = await hiringDb()
    .select()
    .from(candidate)
    .where(and(...candConds))
    .limit(1);
  // Invisible-through-scope rows return NOT_FOUND, never FORBIDDEN — don't leak existence.
  if (!cand) throw new HiringError('NOT_FOUND', 'candidate not found');
  const applicationConds = [
    eq(application.candidate_id, candidate_id),
    tenantScoped(application.tenant_id, session),
  ];
  if (scope) applicationConds.push(scope);
  const [skills, rawApplications, timeline] = await Promise.all([
    hiringDb()
      .select()
      .from(candidateSkill)
      .where(
        and(
          eq(candidateSkill.candidate_id, candidate_id),
          tenantScoped(candidateSkill.tenant_id, session),
        ),
      ),
    hiringDb()
      .select({
        id: application.id,
        requisition_id: application.requisition_id,
        requisition_title: requisition.title,
        requisition_status: requisition.status,
        account_id: requisition.account_id,
        stage: application.stage,
        status: application.status,
        rating: application.rating,
        tags: application.tags,
        version: application.version,
        created_at: application.created_at,
        note: application.note,
      })
      .from(application)
      .innerJoin(requisition, eq(requisition.id, application.requisition_id))
      .where(and(...applicationConds))
      .orderBy(asc(application.created_at)),
    hiringDb()
      .select()
      .from(candidateEvent)
      .where(
        and(
          eq(candidateEvent.candidate_id, candidate_id),
          tenantScoped(candidateEvent.tenant_id, session),
        ),
      )
      .orderBy(asc(candidateEvent.created_at)),
  ]);

  const { reqSkills, candSkills } = await fitFor(
    session,
    [...new Set(rawApplications.map((a) => a.requisition_id))],
    [candidate_id],
  );

  const applications: CandidateApplication[] = rawApplications.map((a) => ({
    application_id: a.id,
    requisition_id: a.requisition_id,
    requisition_title: a.requisition_title,
    requisition_status: a.requisition_status,
    account_id: a.account_id,
    stage: a.stage,
    status: a.status,
    rating: a.rating,
    tags: (a.tags as string[]) ?? [],
    version: a.version,
    applied_at: a.created_at,
    note: a.note,
    fit: computeFit(reqSkills.get(a.requisition_id) ?? [], candSkills.get(candidate_id) ?? []),
  }));

  return { candidate: cand, skills, applications, timeline };
}

export interface TalentPoolRow {
  candidate_id: string;
  name: string;
  seniority: string | null;
  segment: string | null;
  last_status: string | null;
  recommended: { requisition_id: string; title: string; fit: FitResult }[];
}

export async function listTalentPool(session: SessionScope): Promise<TalentPoolRow[]> {
  requirePermission(session, 'hiring.candidate.read');
  const candidateScope = await buildCandidateScope(session);
  const appConds = [eq(application.kind, 'external'), tenantScoped(application.tenant_id, session)];
  if (candidateScope) appConds.push(candidateScope);
  const apps = await hiringDb()
    .select({
      candidate_id: application.candidate_id,
      status: application.status,
      created_at: application.created_at,
    })
    .from(application)
    .where(and(...appConds));

  const active = new Set(
    apps.filter((a) => a.status === 'active').map((a) => a.candidate_id as string),
  );

  // latest application status per candidate — labels the pool card (rejected / transferred / alumni)
  const lastStatus = new Map<string, string>();
  const lastSeen = new Map<string, number>();
  for (const a of apps) {
    if (a.candidate_id == null) continue;
    const ts =
      a.created_at instanceof Date ? a.created_at.getTime() : new Date(a.created_at).getTime();
    if (!lastSeen.has(a.candidate_id) || ts >= (lastSeen.get(a.candidate_id) as number)) {
      lastSeen.set(a.candidate_id, ts);
      lastStatus.set(a.candidate_id, a.status);
    }
  }

  const candConds = [tenantScoped(candidate.tenant_id, session), isNull(candidate.deleted_at)];
  if (candidateScope) {
    candConds.push(sql`EXISTS (SELECT 1 FROM ${application}
      WHERE ${application.candidate_id} = ${candidate.id}
        AND ${application.tenant_id} = ${session.tenant_id}
        AND (${candidateScope}))`);
  }
  const cands = await hiringDb()
    .select()
    .from(candidate)
    .where(and(...candConds));

  const pool = cands.filter((c) => !active.has(c.id) || c.segment === 'alumni');
  if (pool.length === 0) return [];

  const requisitionScope = await buildRequisitionScope(session);
  const reqConds = [eq(requisition.status, 'open'), tenantScoped(requisition.tenant_id, session)];
  if (requisitionScope) reqConds.push(requisitionScope);
  const openReqs = await hiringDb()
    .select({ id: requisition.id, title: requisition.title })
    .from(requisition)
    .where(and(...reqConds));

  const { reqSkills, candSkills } = await fitFor(
    session,
    openReqs.map((r) => r.id),
    pool.map((c) => c.id),
  );

  return pool.map((c) => ({
    candidate_id: c.id,
    name: c.name,
    seniority: c.seniority,
    segment: c.segment,
    last_status: lastStatus.get(c.id) ?? null,
    recommended: openReqs
      .map((r) => ({
        requisition_id: r.id,
        title: r.title,
        fit: computeFit(reqSkills.get(r.id) ?? [], candSkills.get(c.id) ?? []),
      }))
      .filter((r) => r.fit.met > 0)
      .sort((a, b) => b.fit.score - a.fit.score)
      .slice(0, 3),
  }));
}
