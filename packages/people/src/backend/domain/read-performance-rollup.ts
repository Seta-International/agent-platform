import type { SessionScope } from '@seta/core';
import { listAccountIdsManagedBy, listAccounts } from '@seta/pm';
import { can } from '@seta/shared-rbac';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type {
  PerformanceRollupQuery,
  PerformanceRollupResponse,
  ReceivedReview,
  RollupGroupAxis,
  RollupLeaf,
  RollupRow,
} from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import {
  accountProjection,
  employmentPeriod,
  performanceConfigCriterion,
  performanceConfigGroupWeight,
  performanceConfigMonthPin,
  performanceConfigRevision,
  performanceEvaluation,
  performanceEvaluationGroup,
  performanceEvaluationScore,
  person,
  projectProjection,
  workerAllocationProjection,
} from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { unlockedAccountIds } from './cycle-unlock.ts';
import { ensurePerformanceGroups } from './ensure-performance-groups.ts';
import { classifyCycleStatus, monthClockNow } from './month-clock.ts';
import { PERFORMANCE_GROUP_TEMPLATES } from './performance-config-template.ts';
import { allocationInMonth } from './read-performance-context.ts';

/** Scores keyed by group id, carried at full precision until the response is built. */
type ScoreMap = Map<string, number>;

type RawNode = {
  kind: RollupRow['kind'];
  id: string;
  name: string;
  subtitle: string;
  is_lead: boolean;
  member_count: number;
  scored: number;
  total: number;
  scores: ScoreMap;
  /** Null while nothing under this node has been submitted. */
  overall: number | null;
  children: RawNode[];
};

type Allocation = {
  person_id: string;
  project_id: string;
  account_id: string;
  lead_person_id: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(raw: string | number): number {
  return typeof raw === 'number' ? raw : Number(raw);
}

/** Group-weighted mean of the groups that actually carry a score. */
function weighted(axis: readonly RollupGroupAxis[], scores: ScoreMap): number | null {
  let weight = 0;
  let acc = 0;
  for (const g of axis) {
    const s = scores.get(g.group_id);
    if (s === undefined) continue;
    weight += g.weight;
    acc += g.weight * s;
  }
  return weight === 0 ? null : acc / weight;
}

/** Per-group mean across children, skipping the ones with nothing scored yet. */
function meanScores(children: readonly { scores: ScoreMap }[]): ScoreMap {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const c of children) {
    for (const [groupId, value] of c.scores) {
      const cur = sums.get(groupId) ?? { sum: 0, n: 0 };
      cur.sum += value;
      cur.n += 1;
      sums.set(groupId, cur);
    }
  }
  return new Map([...sums].map(([groupId, { sum, n }]) => [groupId, sum / n]));
}

function toLeaf(node: RawNode): RollupLeaf {
  return {
    kind: node.kind,
    id: node.id,
    name: node.name,
    subtitle: node.subtitle,
    is_lead: node.is_lead,
    member_count: node.member_count,
    scored: node.scored,
    total: node.total,
    scores: Object.fromEntries([...node.scores].map(([k, v]) => [k, round2(v)])),
    overall: node.overall === null ? null : round2(node.overall),
  };
}

function toRow(node: RawNode): RollupRow {
  return { ...toLeaf(node), children: node.children.map(toLeaf) };
}

/**
 * The heat-map columns. Group identity is tenant-wide, but weights live on each
 * account's config revision — so an axis spanning several accounts averages them.
 * Averaging vectors that each sum to 100 still sums to 100, and for a single account
 * it reproduces that account's own weights exactly.
 */
async function loadAxis(
  session: SessionScope,
  accountIds: readonly string[],
  month: string,
): Promise<RollupGroupAxis[]> {
  const db = peopleDb();
  await ensurePerformanceGroups(db, session.tenant_id);
  const groups = await db
    .select()
    .from(performanceEvaluationGroup)
    .where(eq(performanceEvaluationGroup.tenant_id, session.tenant_id))
    .orderBy(performanceEvaluationGroup.sort);

  const revisionIds =
    accountIds.length > 0 ? await resolveRevisionIds(session, accountIds, month) : [];
  const weights =
    revisionIds.length === 0
      ? []
      : await db
          .select({
            group_id: performanceConfigGroupWeight.group_id,
            weight: performanceConfigGroupWeight.weight,
          })
          .from(performanceConfigGroupWeight)
          .where(inArray(performanceConfigGroupWeight.revision_id, revisionIds));

  const byGroup = new Map<string, { sum: number; n: number }>();
  for (const w of weights) {
    const cur = byGroup.get(w.group_id) ?? { sum: 0, n: 0 };
    cur.sum += num(w.weight);
    cur.n += 1;
    byGroup.set(w.group_id, cur);
  }
  const templateWeight = new Map(PERFORMANCE_GROUP_TEMPLATES.map((t) => [t.code, t.weight]));

  return groups.map((g) => {
    const agg = byGroup.get(g.id);
    return {
      group_id: g.id,
      code: g.code,
      name: g.name,
      sort: g.sort,
      // No configured revision yet → the seed template's weights, which is exactly what
      // the account would get the first time someone opens its config.
      weight: round2(agg ? agg.sum / agg.n : (templateWeight.get(g.code) ?? 0)),
    };
  });
}

/** The revision each account's cycle is scored against: the month's pin, else its head. */
async function resolveRevisionIds(
  session: SessionScope,
  accountIds: readonly string[],
  month: string,
): Promise<string[]> {
  const db = peopleDb();
  const pins = await db
    .select({
      account_id: performanceConfigMonthPin.account_id,
      revision_id: performanceConfigMonthPin.revision_id,
    })
    .from(performanceConfigMonthPin)
    .where(
      and(
        eq(performanceConfigMonthPin.tenant_id, session.tenant_id),
        eq(performanceConfigMonthPin.review_month, month),
        inArray(performanceConfigMonthPin.account_id, [...accountIds]),
      ),
    );
  const byAccount = new Map(pins.map((p) => [p.account_id, p.revision_id]));

  const missing = accountIds.filter((id) => !byAccount.has(id));
  if (missing.length > 0) {
    const heads = await db
      .select({
        account_id: performanceConfigRevision.account_id,
        id: performanceConfigRevision.id,
        revision_no: performanceConfigRevision.revision_no,
      })
      .from(performanceConfigRevision)
      .where(
        and(
          eq(performanceConfigRevision.tenant_id, session.tenant_id),
          inArray(performanceConfigRevision.account_id, missing),
        ),
      )
      .orderBy(desc(performanceConfigRevision.revision_no));
    // Newest first, so the first row seen per account is its head.
    for (const h of heads) if (!byAccount.has(h.account_id)) byAccount.set(h.account_id, h.id);
  }
  return [...byAccount.values()];
}

/** Submitted evaluations for the month, reduced to one score per group. */
async function loadEvaluationScores(
  session: SessionScope,
  month: string,
  allocations: readonly Allocation[],
): Promise<
  Map<
    string,
    {
      overall: number | null;
      scores: ScoreMap;
      evaluator_person_id: string;
      evaluator_capacity: 'tl' | 'am';
      strengths: string;
      improve: string;
      top_action: string;
      submitted_at: Date | null;
    }
  >
> {
  const wanted = new Set(allocations.map((a) => `${a.person_id}:${a.project_id}`));
  if (wanted.size === 0) return new Map();

  const db = peopleDb();
  const rows = await db
    .select({
      id: performanceEvaluation.id,
      subject_person_id: performanceEvaluation.subject_person_id,
      project_id: performanceEvaluation.project_id,
      overall: performanceEvaluation.overall,
      evaluator_person_id: performanceEvaluation.evaluator_person_id,
      evaluator_capacity: performanceEvaluation.evaluator_capacity,
      strengths: performanceEvaluation.strengths,
      improve: performanceEvaluation.improve,
      top_action: performanceEvaluation.top_action,
      submitted_at: performanceEvaluation.submitted_at,
    })
    .from(performanceEvaluation)
    .where(
      and(
        eq(performanceEvaluation.tenant_id, session.tenant_id),
        eq(performanceEvaluation.review_month, month),
        eq(performanceEvaluation.status, 'submitted'),
      ),
    );
  const kept = rows.filter((r) => wanted.has(`${r.subject_person_id}:${r.project_id}`));
  if (kept.length === 0) return new Map();

  const scoreRows = await db
    .select({
      evaluation_id: performanceEvaluationScore.evaluation_id,
      score: performanceEvaluationScore.score,
      group_id: performanceConfigCriterion.group_id,
      weight: performanceConfigCriterion.weight,
    })
    .from(performanceEvaluationScore)
    .innerJoin(
      performanceConfigCriterion,
      eq(performanceConfigCriterion.id, performanceEvaluationScore.criterion_id),
    )
    .where(
      inArray(
        performanceEvaluationScore.evaluation_id,
        kept.map((r) => r.id),
      ),
    );

  // Criterion-weighted mean inside each group — the same shape submit used.
  const perEval = new Map<string, Map<string, { sum: number; weight: number }>>();
  for (const s of scoreRows) {
    const groups = perEval.get(s.evaluation_id) ?? new Map();
    const cur = groups.get(s.group_id) ?? { sum: 0, weight: 0 };
    const w = num(s.weight);
    cur.sum += w * s.score;
    cur.weight += w;
    groups.set(s.group_id, cur);
    perEval.set(s.evaluation_id, groups);
  }

  return new Map(
    kept.map((r) => {
      const groups = perEval.get(r.id) ?? new Map<string, { sum: number; weight: number }>();
      const scores: ScoreMap = new Map(
        [...groups].flatMap(([groupId, g]) =>
          g.weight === 0 ? [] : [[groupId, g.sum / g.weight]],
        ),
      );
      return [
        `${r.subject_person_id}:${r.project_id}`,
        {
          overall: r.overall === null ? null : num(r.overall),
          scores,
          evaluator_person_id: r.evaluator_person_id,
          evaluator_capacity: r.evaluator_capacity,
          strengths: r.strengths,
          improve: r.improve,
          top_action: r.top_action,
          submitted_at: r.submitted_at,
        },
      ];
    }),
  );
}

async function loadAllocations(
  session: SessionScope,
  month: string,
  filter: { accountIds?: readonly string[]; projectId?: string; personId?: string },
): Promise<Allocation[]> {
  const conds = [
    eq(workerAllocationProjection.tenant_id, session.tenant_id),
    allocationInMonth(month),
  ];
  if (filter.accountIds) {
    if (filter.accountIds.length === 0) return [];
    conds.push(inArray(workerAllocationProjection.account_id, [...filter.accountIds]));
  }
  if (filter.projectId) conds.push(eq(workerAllocationProjection.project_id, filter.projectId));
  if (filter.personId) conds.push(eq(workerAllocationProjection.person_id, filter.personId));

  const rows = await peopleDb()
    .select({
      person_id: workerAllocationProjection.person_id,
      project_id: workerAllocationProjection.project_id,
      account_id: workerAllocationProjection.account_id,
      lead_person_id: workerAllocationProjection.lead_person_id,
    })
    .from(workerAllocationProjection)
    .where(and(...conds));

  // One allocation per (person, project): the evaluation is per project, not per row.
  const seen = new Map<string, Allocation>();
  for (const r of rows) {
    if (!r.person_id) continue;
    const key = `${r.person_id}:${r.project_id}`;
    if (!seen.has(key)) seen.set(key, { ...r, person_id: r.person_id });
  }
  return [...seen.values()];
}

async function loadPeople(
  session: SessionScope,
  ids: readonly string[],
): Promise<Map<string, { name: string; role: string }>> {
  if (ids.length === 0) return new Map();
  // Job title lives on the open employment period, not on the person.
  const rows = await peopleDb()
    .select({ id: person.id, full_name: person.full_name, job_title: employmentPeriod.job_title })
    .from(person)
    .leftJoin(
      employmentPeriod,
      and(
        eq(employmentPeriod.person_id, person.id),
        eq(employmentPeriod.tenant_id, person.tenant_id),
        isNull(employmentPeriod.end_date),
      ),
    )
    .where(
      and(
        eq(person.tenant_id, session.tenant_id),
        inArray(person.id, [...ids]),
        isNull(person.deleted_at),
      ),
    );
  return new Map(rows.map((r) => [r.id, { name: r.full_name ?? '', role: r.job_title ?? '' }]));
}

/** Aggregate a parent from its children: counts add up, scores average. */
function rollUp(
  node: Omit<RawNode, 'scores' | 'overall' | 'scored' | 'total' | 'member_count'> & {
    member_count?: number;
    total?: number;
  },
  axis: readonly RollupGroupAxis[],
): RawNode {
  const scored = node.children.reduce((s, c) => s + c.scored, 0);
  const total = node.total ?? node.children.reduce((s, c) => s + c.total, 0);
  const scores = meanScores(node.children.filter((c) => c.scores.size > 0));
  return {
    ...node,
    member_count: node.member_count ?? node.children.reduce((s, c) => s + c.member_count, 0),
    scored,
    total,
    scores,
    overall: weighted(axis, scores),
  };
}

/**
 * Every Performance dashboard reads through here: the org tier drills accounts →
 * projects, an AM drills projects → people, a TL sees their project's people, and a
 * member sees their own projects plus the reviews they received. One shape, so the
 * heat map and its drill-down never need a second request.
 */
export async function readPerformanceRollup(
  session: SessionScope,
  input: PerformanceRollupQuery,
): Promise<PerformanceRollupResponse> {
  requirePermission(session, 'people.performance.read');
  const db = peopleDb();
  const orgWide = can(session, 'people.performance.read_org');

  let accountIds: string[] = [];
  let allocations: Allocation[] = [];
  let label = '';
  let accountNames = new Map<string, string>();
  let amPersonIds = new Map<string, string | null>();

  if (input.scope === 'org') {
    requirePermission(session, 'people.performance.read_org');
    const accounts = await listAccounts(session);
    accountIds = accounts.map((a) => a.account_id);
    accountNames = new Map(accounts.map((a) => [a.account_id, a.name]));
    amPersonIds = new Map(accounts.map((a) => [a.account_id, a.am_worker_id ?? null]));
    label = 'Company';
    allocations = await loadAllocations(session, input.month, { accountIds });
  } else if (input.scope === 'account') {
    const accountId = input.account_id;
    if (!accountId) throw new PeopleError('VALIDATION', 'account_id: required for scope=account');
    if (!orgWide) {
      const managed = session.person_id
        ? await listAccountIdsManagedBy(session.person_id, session.tenant_id)
        : [];
      if (!managed.includes(accountId)) {
        throw new PeopleError('FORBIDDEN', 'Account is not managed by this user', {
          account_id: accountId,
        });
      }
    }
    accountIds = [accountId];
    const [acc] = await db
      .select({ name: accountProjection.name })
      .from(accountProjection)
      .where(
        and(
          eq(accountProjection.tenant_id, session.tenant_id),
          eq(accountProjection.account_id, accountId),
        ),
      );
    if (!acc) throw new PeopleError('VALIDATION', 'account_id: unknown account');
    label = acc.name;
    accountNames = new Map([[accountId, acc.name]]);
    allocations = await loadAllocations(session, input.month, { accountIds });
  } else if (input.scope === 'project') {
    const projectId = input.project_id;
    if (!projectId) throw new PeopleError('VALIDATION', 'project_id: required for scope=project');
    const [proj] = await db
      .select({ name: projectProjection.name, account_id: projectProjection.account_id })
      .from(projectProjection)
      .where(
        and(
          eq(projectProjection.tenant_id, session.tenant_id),
          eq(projectProjection.project_id, projectId),
        ),
      );
    if (!proj) throw new PeopleError('VALIDATION', 'project_id: unknown project');
    allocations = await loadAllocations(session, input.month, { projectId });
    const isLead = allocations.some((a) => a.lead_person_id === session.person_id);
    const isAm =
      session.person_id != null &&
      (await listAccountIdsManagedBy(session.person_id, session.tenant_id)).includes(
        proj.account_id,
      );
    if (!orgWide && !isLead && !isAm) {
      throw new PeopleError('FORBIDDEN', 'You do not lead this project', {
        project_id: projectId,
      });
    }
    accountIds = [proj.account_id];
    label = proj.name;
  } else {
    if (!session.person_id)
      throw new PeopleError('FORBIDDEN', 'No employee record linked to session');
    allocations = await loadAllocations(session, input.month, { personId: session.person_id });
    accountIds = [...new Set(allocations.map((a) => a.account_id))];
    const me = await loadPeople(session, [session.person_id]);
    label = me.get(session.person_id)?.name ?? '';
  }

  const axis = await loadAxis(session, accountIds, input.month);
  const evaluations = await loadEvaluationScores(session, input.month, allocations);

  const open = await unlockedAccountIds(session, input.month, accountIds);
  const { status: cycle_status } = classifyCycleStatus({
    month: input.month,
    at: monthClockNow(),
    overrideActive: open.size > 0,
  });

  const projectIds = [...new Set(allocations.map((a) => a.project_id))];
  const projectRows =
    projectIds.length === 0
      ? []
      : await db
          .select({
            project_id: projectProjection.project_id,
            name: projectProjection.name,
            account_id: projectProjection.account_id,
          })
          .from(projectProjection)
          .where(
            and(
              eq(projectProjection.tenant_id, session.tenant_id),
              inArray(projectProjection.project_id, projectIds),
            ),
          );
  const projectById = new Map(projectRows.map((p) => [p.project_id, p]));

  const leadIds = allocations.flatMap((a) => (a.lead_person_id ? [a.lead_person_id] : []));
  const people = await loadPeople(session, [
    ...new Set([
      ...allocations.map((a) => a.person_id),
      ...leadIds,
      ...[...amPersonIds.values()].flatMap((id) => (id ? [id] : [])),
      ...[...evaluations.values()].map((e) => e.evaluator_person_id),
    ]),
  ]);

  /** One node per person allocated to the project, scored or not. */
  const personNodes = (projectId: string): RawNode[] =>
    allocations
      .filter((a) => a.project_id === projectId)
      .map((a) => {
        const evaluation = evaluations.get(`${a.person_id}:${a.project_id}`);
        const p = people.get(a.person_id);
        return {
          kind: 'person' as const,
          id: a.person_id,
          name: p?.name ?? '',
          subtitle: p?.role ?? '',
          is_lead: a.lead_person_id === a.person_id,
          member_count: 1,
          scored: evaluation ? 1 : 0,
          total: 1,
          scores: evaluation?.scores ?? new Map(),
          overall: evaluation?.overall ?? null,
          children: [],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

  const projectNode = (projectId: string): RawNode => {
    const children = personNodes(projectId);
    const lead = allocations.find((a) => a.project_id === projectId)?.lead_person_id;
    return rollUp(
      {
        kind: 'project',
        id: projectId,
        name: projectById.get(projectId)?.name ?? '',
        subtitle: lead ? (people.get(lead)?.name ?? '') : '',
        is_lead: false,
        children,
        member_count: children.length,
      },
      axis,
    );
  };

  let rows: RawNode[];
  if (input.scope === 'org') {
    rows = accountIds
      .map((accountId) => {
        const children = [
          ...new Set(
            allocations.filter((a) => a.account_id === accountId).map((a) => a.project_id),
          ),
        ]
          .map(projectNode)
          .sort((a, b) => a.name.localeCompare(b.name));
        const amId = amPersonIds.get(accountId);
        return rollUp(
          {
            kind: 'account',
            id: accountId,
            name: accountNames.get(accountId) ?? '',
            subtitle: amId ? (people.get(amId)?.name ?? '') : '',
            is_lead: false,
            children,
          },
          axis,
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } else if (input.scope === 'account' || input.scope === 'self') {
    rows = projectIds.map(projectNode).sort((a, b) => a.name.localeCompare(b.name));
  } else {
    rows = personNodes(input.project_id as string);
  }

  const topScores = meanScores(rows.filter((r) => r.scores.size > 0));
  const reviews: ReceivedReview[] =
    input.scope !== 'self'
      ? []
      : allocations.flatMap((a) => {
          const evaluation = evaluations.get(`${a.person_id}:${a.project_id}`);
          if (!evaluation) return [];
          return [
            {
              project_id: a.project_id,
              project_name: projectById.get(a.project_id)?.name ?? '',
              evaluator_name: people.get(evaluation.evaluator_person_id)?.name ?? '',
              evaluator_capacity: evaluation.evaluator_capacity,
              status: 'submitted' as const,
              overall: evaluation.overall === null ? null : round2(evaluation.overall),
              scores: Object.fromEntries([...evaluation.scores].map(([k, v]) => [k, round2(v)])),
              strengths: evaluation.strengths,
              improve: evaluation.improve,
              top_action: evaluation.top_action,
              submitted_at: evaluation.submitted_at?.toISOString() ?? null,
            },
          ];
        });

  const overall = weighted(axis, topScores);
  return {
    month: input.month,
    cycle_status,
    scope: input.scope,
    label,
    groups: axis,
    scores: Object.fromEntries([...topScores].map(([k, v]) => [k, round2(v)])),
    scored: rows.reduce((s, r) => s + r.scored, 0),
    total: rows.reduce((s, r) => s + r.total, 0),
    overall: overall === null ? null : round2(overall),
    rows: rows.map(toRow),
    reviews,
  };
}
