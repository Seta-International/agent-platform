import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { listAccountIdsManagedBy } from '@seta/pm';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type {
  EvaluationCriterionView,
  EvaluationScoreInput,
  EvaluationTargetQuery,
  EvaluationView,
  EvaluationWriteInput,
  EvaluatorCapacity,
  PerformanceConfigGroupView,
} from '../../contracts.ts';
import { SCORE_MAX, SCORE_MIN, TOP_ACTION_REQUIRED_BELOW } from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import {
  performanceConfigMonthPin,
  performanceEvaluation,
  performanceEvaluationScore,
  person,
  projectProjection,
  workerAllocationProjection,
} from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { resolveOverrideActive } from './cycle-unlock.ts';
import { type CycleStatus, classifyCycleStatus, monthClockNow } from './month-clock.ts';
import { ensureAccountConfigRevision1, loadRevisionTree } from './read-performance-config.ts';

type EvaluationRow = typeof performanceEvaluation.$inferSelect;
type ScoreRow = { criterion_id: string; score: number; evidence: string };

/** The windows in which an evaluation may still be written. */
function windowOpen(status: CycleStatus): boolean {
  return status === 'open' || status === 'makeup' || status === 'override';
}

/** Evidence is mandatory at the ends of the scale (AC3). */
function evidenceRequired(score: number | null): boolean {
  return score === SCORE_MIN || score === SCORE_MAX;
}

/**
 * Who the caller is allowed to be for this (subject, project): the project's TL scores
 * its members, the account's AM scores the project's TL. Anyone else — including another
 * member of the same project — is refused, and nobody scores themselves (AC8).
 */
async function resolveTarget(
  session: SessionScope,
  input: EvaluationTargetQuery,
): Promise<{
  capacity: EvaluatorCapacity;
  evaluator_person_id: string;
  account_id: string;
  project_name: string;
  subject_name: string;
}> {
  requirePermission(session, 'people.performance.read');
  const me = session.person_id;
  if (!me) throw new PeopleError('FORBIDDEN', 'No employee record linked to session');
  if (me === input.subject_person_id) {
    throw new PeopleError('FORBIDDEN', 'An evaluation is never written about yourself');
  }

  const db = peopleDb();
  const [project] = await db
    .select({ account_id: projectProjection.account_id, name: projectProjection.name })
    .from(projectProjection)
    .where(
      and(
        eq(projectProjection.tenant_id, session.tenant_id),
        eq(projectProjection.project_id, input.project_id),
      ),
    )
    .limit(1);
  if (!project) throw new PeopleError('VALIDATION', 'project_id: unknown project');

  const monthStart = `${input.month}-01`;
  const [allocation] = await db
    .select({ lead_person_id: workerAllocationProjection.lead_person_id })
    .from(workerAllocationProjection)
    .where(
      and(
        eq(workerAllocationProjection.tenant_id, session.tenant_id),
        eq(workerAllocationProjection.project_id, input.project_id),
        eq(workerAllocationProjection.person_id, input.subject_person_id),
        eq(workerAllocationProjection.active, true),
        or(
          isNull(workerAllocationProjection.date_from),
          sql`${workerAllocationProjection.date_from} < (${monthStart}::date + interval '1 month')`,
        ),
        or(
          isNull(workerAllocationProjection.date_to),
          sql`${workerAllocationProjection.date_to} >= ${monthStart}::date`,
        ),
      ),
    )
    .limit(1);
  if (!allocation) {
    throw new PeopleError('VALIDATION', 'subject_person_id: not allocated to this project', {
      month: input.month,
    });
  }

  const [subject] = await db
    .select({ full_name: person.full_name })
    .from(person)
    .where(
      and(
        eq(person.tenant_id, session.tenant_id),
        eq(person.id, input.subject_person_id),
        isNull(person.deleted_at),
      ),
    )
    .limit(1);
  if (!subject) throw new PeopleError('VALIDATION', 'subject_person_id: unknown person');

  const base = {
    evaluator_person_id: me,
    account_id: project.account_id,
    project_name: project.name,
    subject_name: subject.full_name ?? '',
  };

  if (allocation.lead_person_id === me) return { ...base, capacity: 'tl' };

  // The TL of a project leads themselves in the allocation grid, so "subject is the
  // project lead" is exactly the case the AM owns.
  const subjectIsLead = allocation.lead_person_id === input.subject_person_id;
  if (subjectIsLead) {
    const managed = await listAccountIdsManagedBy(me, session.tenant_id);
    if (managed.includes(project.account_id)) return { ...base, capacity: 'am' };
  }

  throw new PeopleError('FORBIDDEN', 'You do not evaluate this person on this project', {
    project_id: input.project_id,
    subject_person_id: input.subject_person_id,
  });
}

/**
 * The criteria axis this evaluation is scored against. An existing evaluation keeps the
 * revision it was started on — reweighting the account mid-cycle must not silently
 * rescore work already done — and a new one takes the month's pinned revision.
 */
async function resolveRevisionId(
  session: SessionScope,
  accountId: string,
  month: string,
  existing: EvaluationRow | undefined,
): Promise<string> {
  if (existing) return existing.revision_id;
  const [pin] = await peopleDb()
    .select({ revision_id: performanceConfigMonthPin.revision_id })
    .from(performanceConfigMonthPin)
    .where(
      and(
        eq(performanceConfigMonthPin.tenant_id, session.tenant_id),
        eq(performanceConfigMonthPin.account_id, accountId),
        eq(performanceConfigMonthPin.review_month, month),
      ),
    )
    .limit(1);
  if (pin) return pin.revision_id;
  const head = await ensureAccountConfigRevision1(session.tenant_id, accountId, session.user_id);
  return head.revision_id;
}

async function loadEvaluation(
  session: SessionScope,
  input: EvaluationTargetQuery,
): Promise<EvaluationRow | undefined> {
  const [row] = await peopleDb()
    .select()
    .from(performanceEvaluation)
    .where(
      and(
        eq(performanceEvaluation.tenant_id, session.tenant_id),
        eq(performanceEvaluation.review_month, input.month),
        eq(performanceEvaluation.subject_person_id, input.subject_person_id),
        eq(performanceEvaluation.project_id, input.project_id),
      ),
    )
    .limit(1);
  return row;
}

async function loadScores(evaluationId: string): Promise<Map<string, ScoreRow>> {
  const rows = await peopleDb()
    .select({
      criterion_id: performanceEvaluationScore.criterion_id,
      score: performanceEvaluationScore.score,
      evidence: performanceEvaluationScore.evidence,
    })
    .from(performanceEvaluationScore)
    .where(eq(performanceEvaluationScore.evaluation_id, evaluationId));
  return new Map(rows.map((r) => [r.criterion_id, r]));
}

/**
 * Criterion-weighted mean inside each group, then group-weighted mean across them —
 * the same shape the config screen presents, so a weight edit reads the way it looks.
 * Only ever called once every criterion is scored, so no group can be empty.
 */
function weightedOverall(
  groups: PerformanceConfigGroupView[],
  scores: Map<string, ScoreRow>,
): number {
  let weightSum = 0;
  let acc = 0;
  for (const g of groups) {
    let cw = 0;
    let cAcc = 0;
    for (const c of g.criteria) {
      const s = scores.get(c.id);
      if (!s) continue;
      cw += c.weight;
      cAcc += c.weight * s.score;
    }
    if (cw === 0) continue;
    weightSum += g.weight;
    acc += g.weight * (cAcc / cw);
  }
  if (weightSum === 0) return 0;
  return Math.round((acc / weightSum) * 100) / 100;
}

function buildView(args: {
  input: EvaluationTargetQuery;
  target: Awaited<ReturnType<typeof resolveTarget>>;
  cycleStatus: CycleStatus;
  revisionId: string;
  groups: PerformanceConfigGroupView[];
  scores: Map<string, ScoreRow>;
  row: EvaluationRow | undefined;
}): EvaluationView {
  const { input, target, cycleStatus, revisionId, groups, scores, row } = args;
  let topActionRequired = false;
  const viewGroups = groups.map((g) => ({
    group_id: g.group_id,
    code: g.code,
    name: g.name,
    weight: g.weight,
    sort: g.sort,
    criteria: g.criteria.map((c): EvaluationCriterionView => {
      const s = scores.get(c.id);
      const score = s?.score ?? null;
      if (score !== null && score < TOP_ACTION_REQUIRED_BELOW) topActionRequired = true;
      return {
        criterion_id: c.id,
        name: c.name,
        weight: c.weight,
        sort: c.sort,
        score,
        evidence: s?.evidence ?? '',
        evidence_required: evidenceRequired(score),
      };
    }),
  }));

  return {
    month: input.month,
    cycle_status: cycleStatus,
    editable: windowOpen(cycleStatus),
    subject: {
      person_id: input.subject_person_id,
      full_name: target.subject_name,
      project_id: input.project_id,
      project_name: target.project_name,
      account_id: target.account_id,
    },
    evaluator_capacity: target.capacity,
    status: row?.status ?? 'draft',
    version: row?.version ?? 0,
    revision_id: revisionId,
    overall: row?.overall == null ? null : Number(row.overall),
    strengths: row?.strengths ?? '',
    improve: row?.improve ?? '',
    top_action: row?.top_action ?? '',
    top_action_required: topActionRequired,
    submitted_at: row?.submitted_at?.toISOString() ?? null,
    groups: viewGroups,
  };
}

/** The evaluation form for one subject on one project (AC1). */
export async function readEvaluation(
  session: SessionScope,
  input: EvaluationTargetQuery,
): Promise<EvaluationView> {
  const target = await resolveTarget(session, input);
  const overrideActive = await resolveOverrideActive(session, {
    month: input.month,
    account_id: target.account_id,
  });
  const { status } = classifyCycleStatus({
    month: input.month,
    at: monthClockNow(),
    overrideActive,
  });

  const row = await loadEvaluation(session, input);
  const revisionId = await resolveRevisionId(session, target.account_id, input.month, row);
  const groups = await loadRevisionTree(revisionId);
  const scores = row ? await loadScores(row.id) : new Map<string, ScoreRow>();

  return buildView({ input, target, cycleStatus: status, revisionId, groups, scores, row });
}

/**
 * Scores keyed by criterion, restricted to the evaluation's own revision. An unscored
 * criterion simply has no row — that is what a half-filled draft looks like.
 */
function normalizeScores(
  groups: PerformanceConfigGroupView[],
  incoming: readonly EvaluationScoreInput[],
): Map<string, ScoreRow> {
  const known = new Set(groups.flatMap((g) => g.criteria.map((c) => c.id)));
  const out = new Map<string, ScoreRow>();
  for (const s of incoming) {
    if (!known.has(s.criterion_id)) {
      throw new PeopleError('VALIDATION', 'scores: criterion is not part of this evaluation', {
        criterion_id: s.criterion_id,
      });
    }
    if (s.score === null) continue;
    out.set(s.criterion_id, {
      criterion_id: s.criterion_id,
      score: s.score,
      evidence: s.evidence.trim(),
    });
  }
  return out;
}

/**
 * Submit-time completeness (AC4): every criterion scored, evidence wherever the score is
 * at the ends of the scale, and a Top Action whenever anything scored below 4. The first
 * failure names the exact field so the FE can point at it instead of saying "incomplete".
 */
function assertSubmittable(
  groups: PerformanceConfigGroupView[],
  scores: Map<string, ScoreRow>,
  topAction: string,
): void {
  let anyBelowBar = false;
  for (const g of groups) {
    for (const c of g.criteria) {
      const s = scores.get(c.id);
      if (!s) {
        throw new PeopleError('VALIDATION', `Score “${c.name}” before submitting.`, {
          criterion_id: c.id,
        });
      }
      if (evidenceRequired(s.score) && s.evidence.length === 0) {
        throw new PeopleError(
          'VALIDATION',
          `A score of ${s.score} needs evidence — add it to “${c.name}”.`,
          { criterion_id: c.id },
        );
      }
      if (s.score < TOP_ACTION_REQUIRED_BELOW) anyBelowBar = true;
    }
  }
  if (anyBelowBar && topAction.trim().length === 0) {
    throw new PeopleError(
      'VALIDATION',
      'A Top Action is required when any criterion scores below 4.',
      { field: 'top_action' },
    );
  }
}

async function writeEvaluation(
  session: SessionScope,
  input: EvaluationWriteInput,
  mode: 'draft' | 'submitted',
): Promise<EvaluationView> {
  const target = await resolveTarget(session, input);
  const at = monthClockNow();
  const overrideActive = await resolveOverrideActive(session, {
    month: input.month,
    account_id: target.account_id,
  });
  const { status: cycleStatus } = classifyCycleStatus({
    month: input.month,
    at,
    overrideActive,
  });
  if (!windowOpen(cycleStatus)) {
    throw new PeopleError(
      'VALIDATION',
      'This cycle is closed. Need to change it? Request an unlock.',
      { month: input.month, cycle_status: cycleStatus },
    );
  }

  let saved!: {
    row: EvaluationRow;
    groups: PerformanceConfigGroupView[];
    scores: Map<string, ScoreRow>;
  };

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      // Serialize the two-tab race on this one evaluation so the version check below
      // cannot be read stale by a concurrent write.
      const lockKey = `perf-eval:${session.tenant_id}:${input.month}:${input.subject_person_id}:${input.project_id}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`);

      const [existing] = await tx
        .select()
        .from(performanceEvaluation)
        .where(
          and(
            eq(performanceEvaluation.tenant_id, session.tenant_id),
            eq(performanceEvaluation.review_month, input.month),
            eq(performanceEvaluation.subject_person_id, input.subject_person_id),
            eq(performanceEvaluation.project_id, input.project_id),
          ),
        )
        .limit(1);

      const currentVersion = existing?.version ?? 0;
      if (input.base_version !== currentVersion) {
        throw new PeopleError(
          'CONFLICT',
          'This evaluation changed in another tab — reload before saving.',
          { current_version: currentVersion },
        );
      }

      const revisionId = await resolveRevisionId(
        session,
        target.account_id,
        input.month,
        existing as EvaluationRow | undefined,
      );
      const groups = await loadRevisionTree(revisionId);
      const scores = normalizeScores(groups, input.scores);
      if (mode === 'submitted') assertSubmittable(groups, scores, input.top_action);

      const overall = mode === 'submitted' ? weightedOverall(groups, scores) : null;
      const values = {
        tenant_id: session.tenant_id,
        review_month: input.month,
        subject_person_id: input.subject_person_id,
        project_id: input.project_id,
        account_id: target.account_id,
        evaluator_person_id: target.evaluator_person_id,
        evaluator_capacity: target.capacity,
        revision_id: revisionId,
        status: mode,
        overall: overall === null ? null : overall.toFixed(2),
        strengths: input.strengths,
        improve: input.improve,
        top_action: input.top_action,
        submitted_at: mode === 'submitted' ? at : null,
        version: currentVersion + 1,
        updated_at: at,
      };

      const [row] = existing
        ? await tx
            .update(performanceEvaluation)
            .set(values)
            .where(eq(performanceEvaluation.id, existing.id))
            .returning()
        : await tx.insert(performanceEvaluation).values(values).returning();

      const written = row as EvaluationRow;
      await tx
        .delete(performanceEvaluationScore)
        .where(eq(performanceEvaluationScore.evaluation_id, written.id));
      if (scores.size > 0) {
        await tx.insert(performanceEvaluationScore).values(
          [...scores.values()].map((s) => ({
            tenant_id: session.tenant_id,
            evaluation_id: written.id,
            criterion_id: s.criterion_id,
            score: s.score,
            evidence: s.evidence,
          })),
        );
      }

      if (mode === 'submitted') {
        await emit({
          tenantId: session.tenant_id,
          aggregateType: 'people.performance_evaluation',
          aggregateId: written.id,
          eventType: 'people.performance.evaluation.submitted',
          eventVersion: 1,
          payload: {
            month: input.month,
            account_id: target.account_id,
            project_id: input.project_id,
            subject_person_id: input.subject_person_id,
            evaluator_person_id: target.evaluator_person_id,
            evaluator_capacity: target.capacity,
            overall,
          },
        });
      }

      saved = { row: written, groups, scores };
    },
  );

  return buildView({
    input,
    target,
    cycleStatus,
    revisionId: saved.row.revision_id,
    groups: saved.groups,
    scores: saved.scores,
    row: saved.row,
  });
}

/** Save work in progress — no completeness rules, no official score yet (AC5/AC6). */
export function saveEvaluationDraft(
  session: SessionScope,
  input: EvaluationWriteInput,
): Promise<EvaluationView> {
  return writeEvaluation(session, input, 'draft');
}

/** Finalize: enforce completeness, then compute the official overall (AC4/AC5). */
export function submitEvaluation(
  session: SessionScope,
  input: EvaluationWriteInput,
): Promise<EvaluationView> {
  return writeEvaluation(session, input, 'submitted');
}
