import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
import type {
  CompleteInterviewInput,
  InterviewOutcomeReasonInput,
  RescheduleInterviewInput,
  ScheduleInterviewInput,
} from '../../contracts.ts';
import {
  HIRING_INTERVIEW_OUTCOME_RECORDED,
  HIRING_INTERVIEW_RESCHEDULED,
  HIRING_INTERVIEW_SCHEDULED,
} from '../../events.ts';
import { hiringDb } from '../db/client.ts';
import { application, candidate, interview, interviewPanelist, requisition } from '../db/schema.ts';
import { HiringError, requirePermission } from '../rbac.ts';
import { assertApplicationRequisitionNotOnHold, recordCandidateEvent } from './candidates.ts';
import { buildCandidateScope } from './scope.ts';

type Tx = Parameters<Parameters<typeof withEmit>[1]>[0];

const ROUND_LABEL: Record<string, string> = {
  screening: 'Screening',
  technical: 'Technical',
  culture_fit: 'Culture fit',
  final: 'Final',
};
const RESULT_LABEL: Record<string, string> = { pass: 'Pass', hold: 'Hold', fail: 'Fail' };

export interface InterviewPanelistRow {
  user_id: string;
  display_name: string;
}

export interface InterviewListRow {
  id: string;
  application_id: string;
  candidate_id: string;
  candidate_name: string;
  requisition_id: string;
  requisition_title: string;
  round: string;
  scheduled_at: Date;
  duration_minutes: number;
  mode: string;
  meeting_link: string | null;
  note: string | null;
  status: string;
  result: string | null;
  rating: number | null;
  recommendation: string | null;
  feedback_note: string | null;
  outcome_reason: string | null;
  version: number;
  panel: InterviewPanelistRow[];
}

// FUT-833-style: candidate name / position title search, same shape as candidateSearchCond.
function interviewSearchCond(q: string) {
  const needle = `%${q.toLowerCase()}%`;
  return or(ilike(candidate.name, needle), ilike(requisition.title, needle));
}

async function attachPanels<T extends { id: string }>(
  session: SessionScope,
  rows: T[],
): Promise<(T & { panel: InterviewPanelistRow[] })[]> {
  if (rows.length === 0) return [];
  const panelRows = await hiringDb()
    .select({
      interview_id: interviewPanelist.interview_id,
      user_id: interviewPanelist.user_id,
      display_name: interviewPanelist.display_name,
    })
    .from(interviewPanelist)
    .where(
      and(
        tenantScoped(interviewPanelist.tenant_id, session),
        inArray(
          interviewPanelist.interview_id,
          rows.map((r) => r.id),
        ),
      ),
    );
  const byInterview = new Map<string, InterviewPanelistRow[]>();
  for (const p of panelRows) {
    const list = byInterview.get(p.interview_id) ?? [];
    list.push({ user_id: p.user_id, display_name: p.display_name });
    byInterview.set(p.interview_id, list);
  }
  return rows.map((r) => ({ ...r, panel: byInterview.get(r.id) ?? [] }));
}

// The agenda's full dataset: one row per interview, joined to candidate + requisition for
// display, scoped exactly like listCandidates (same buildCandidateScope, applied through the
// same application.requisition_id predicate).
export async function listInterviews(
  session: SessionScope,
  q?: string,
): Promise<InterviewListRow[]> {
  requirePermission(session, 'hiring.candidate.read');
  const conds = [tenantScoped(interview.tenant_id, session)];
  const search = q?.trim() ? interviewSearchCond(q) : undefined;
  if (search) conds.push(search);
  const scope = await buildCandidateScope(session);
  if (scope) conds.push(scope);
  const rows = await hiringDb()
    .select({
      id: interview.id,
      application_id: interview.application_id,
      candidate_id: interview.candidate_id,
      candidate_name: candidate.name,
      requisition_id: application.requisition_id,
      requisition_title: requisition.title,
      round: interview.round,
      scheduled_at: interview.scheduled_at,
      duration_minutes: interview.duration_minutes,
      mode: interview.mode,
      meeting_link: interview.meeting_link,
      note: interview.note,
      status: interview.status,
      result: interview.result,
      rating: interview.rating,
      recommendation: interview.recommendation,
      feedback_note: interview.feedback_note,
      outcome_reason: interview.outcome_reason,
      version: interview.version,
    })
    .from(interview)
    .innerJoin(application, eq(application.id, interview.application_id))
    .innerJoin(candidate, eq(candidate.id, interview.candidate_id))
    .innerJoin(requisition, eq(requisition.id, application.requisition_id))
    .where(and(...conds))
    .orderBy(asc(interview.scheduled_at));
  return attachPanels(session, rows);
}

async function loadInterview(
  interview_id: string,
  session: SessionScope,
): Promise<{ version: number; status: string; application_id: string; candidate_id: string }> {
  const [cur] = await hiringDb()
    .select({
      version: interview.version,
      status: interview.status,
      application_id: interview.application_id,
      candidate_id: interview.candidate_id,
    })
    .from(interview)
    .where(and(eq(interview.id, interview_id), tenantScoped(interview.tenant_id, session)))
    .limit(1);
  if (!cur) throw new HiringError('NOT_FOUND', 'interview not found');
  return cur;
}

async function replacePanel(
  tx: Tx,
  session: SessionScope,
  interview_id: string,
  panel: { user_id: string; display_name: string }[],
): Promise<void> {
  await tx
    .delete(interviewPanelist)
    .where(
      and(
        eq(interviewPanelist.interview_id, interview_id),
        tenantScoped(interviewPanelist.tenant_id, session),
      ),
    );
  if (panel.length) {
    await tx.insert(interviewPanelist).values(
      panel.map((p) => ({
        tenant_id: session.tenant_id,
        interview_id,
        user_id: p.user_id,
        display_name: p.display_name,
      })),
    );
  }
}

// AC1 (FUT-487): saved with status Scheduled and result Pending (result stays NULL until an
// outcome is recorded) — only an active application's candidate can have a round scheduled.
export async function scheduleInterview(
  input: ScheduleInterviewInput & { session: SessionScope },
): Promise<{ interview_id: string; version: number }> {
  const { session } = input;
  requirePermission(session, 'hiring.candidate.manage');

  const [app] = await hiringDb()
    .select({
      id: application.id,
      status: application.status,
      candidate_id: application.candidate_id,
    })
    .from(application)
    .where(
      and(eq(application.id, input.application_id), tenantScoped(application.tenant_id, session)),
    )
    .limit(1);
  if (!app) throw new HiringError('NOT_FOUND', 'application not found');
  if (app.status !== 'active')
    throw new HiringError(
      'CONFLICT',
      `cannot schedule an interview for a ${app.status} application — only active applications qualify`,
    );
  if (!app.candidate_id) throw new HiringError('VALIDATION', 'application has no candidate');
  await assertApplicationRequisitionNotOnHold(input.application_id, session);
  const candidateId = app.candidate_id;

  let result!: { interview_id: string; version: number };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [created] = await tx
        .insert(interview)
        .values({
          tenant_id: session.tenant_id,
          application_id: input.application_id,
          candidate_id: candidateId,
          round: input.round,
          scheduled_at: new Date(input.scheduled_at),
          duration_minutes: input.duration_minutes,
          mode: input.mode,
          meeting_link: input.meeting_link || null,
          note: input.note || null,
        })
        .returning({ id: interview.id, version: interview.version });
      if (!created) throw new Error('interview insert returned no row');

      if (input.panel.length) {
        await tx.insert(interviewPanelist).values(
          input.panel.map((p) => ({
            tenant_id: session.tenant_id,
            interview_id: created.id,
            user_id: p.user_id,
            display_name: p.display_name,
          })),
        );
      }

      await recordCandidateEvent(tx, {
        session,
        candidate_id: candidateId,
        application_id: input.application_id,
        kind: 'interview_scheduled',
        summary: `Interview scheduled — ${ROUND_LABEL[input.round] ?? input.round} round`,
        detail: { interview_id: created.id, round: input.round, scheduled_at: input.scheduled_at },
      });
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.interview',
        aggregateId: created.id,
        eventType: HIRING_INTERVIEW_SCHEDULED,
        eventVersion: 1,
        payload: {
          interview_id: created.id,
          application_id: input.application_id,
          candidate_id: candidateId,
          tenant_id: session.tenant_id,
        },
      });
      result = { interview_id: created.id, version: created.version };
    },
  );
  return result;
}

// Only a still-Scheduled interview can move — an on-hold requisition blocks it the same way it
// blocks scheduling (both create/advance pipeline activity); recording an outcome does not
// (see completeInterview/cancelInterview/markInterviewNoShow — same FUT-773 exemption
// transferApplication gets, for closing out something that already happened).
export async function rescheduleInterview(input: {
  interview_id: string;
  expected_version?: number;
  input: RescheduleInterviewInput;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, interview_id } = input;
  requirePermission(session, 'hiring.candidate.manage');
  const cur = await loadInterview(interview_id, session);
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  if (cur.status !== 'scheduled')
    throw new HiringError('CONFLICT', `cannot reschedule a ${cur.status} interview`);
  await assertApplicationRequisitionNotOnHold(cur.application_id, session);

  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(interview)
        .set({
          round: input.input.round,
          scheduled_at: new Date(input.input.scheduled_at),
          duration_minutes: input.input.duration_minutes,
          mode: input.input.mode,
          meeting_link: input.input.meeting_link || null,
          note: input.input.note || null,
          version: next,
          updated_at: new Date(),
        })
        .where(and(eq(interview.id, interview_id), eq(interview.version, cur.version)))
        .returning({ id: interview.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'interview was modified concurrently');

      await replacePanel(tx, session, interview_id, input.input.panel);

      await recordCandidateEvent(tx, {
        session,
        candidate_id: cur.candidate_id,
        application_id: cur.application_id,
        kind: 'interview_rescheduled',
        summary: `Interview rescheduled — ${ROUND_LABEL[input.input.round] ?? input.input.round} round`,
        detail: { interview_id, scheduled_at: input.input.scheduled_at },
      });
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.interview',
        aggregateId: interview_id,
        eventType: HIRING_INTERVIEW_RESCHEDULED,
        eventVersion: 1,
        payload: { interview_id, application_id: cur.application_id, tenant_id: session.tenant_id },
      });
    },
  );
  return { version: next };
}

// AC2/AC3 (FUT-487): status → Completed retains the outcome (result + rating/recommendation/
// feedback) with a timestamped, actor-named audit entry. Also doubles as "edit outcome" — the
// panel's feedback is allowed to be corrected after the fact, so an already-completed interview
// may be recorded again; cancelled/no-show are terminal and may not.
export async function completeInterview(input: {
  interview_id: string;
  expected_version?: number;
  input: CompleteInterviewInput;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, interview_id } = input;
  requirePermission(session, 'hiring.candidate.manage');
  const cur = await loadInterview(interview_id, session);
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  if (cur.status !== 'scheduled' && cur.status !== 'completed')
    throw new HiringError('CONFLICT', `cannot record an outcome for a ${cur.status} interview`);
  const wasAlreadyCompleted = cur.status === 'completed';

  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(interview)
        .set({
          status: 'completed',
          result: input.input.result,
          rating: input.input.rating ?? null,
          recommendation: input.input.recommendation ?? null,
          feedback_note: input.input.feedback_note || null,
          version: next,
          updated_at: new Date(),
        })
        .where(and(eq(interview.id, interview_id), eq(interview.version, cur.version)))
        .returning({ id: interview.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'interview was modified concurrently');

      await recordCandidateEvent(tx, {
        session,
        candidate_id: cur.candidate_id,
        application_id: cur.application_id,
        kind: 'interview_completed',
        summary: `Interview ${wasAlreadyCompleted ? 'outcome updated' : 'completed'} — ${RESULT_LABEL[input.input.result] ?? input.input.result}`,
        detail: { interview_id, result: input.input.result, rating: input.input.rating ?? null },
      });
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.interview',
        aggregateId: interview_id,
        eventType: HIRING_INTERVIEW_OUTCOME_RECORDED,
        eventVersion: 1,
        payload: {
          interview_id,
          application_id: cur.application_id,
          tenant_id: session.tenant_id,
          status: 'completed',
        },
      });
    },
  );
  return { version: next };
}

export async function cancelInterview(input: {
  interview_id: string;
  expected_version?: number;
  input: InterviewOutcomeReasonInput;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, interview_id } = input;
  requirePermission(session, 'hiring.candidate.manage');
  const cur = await loadInterview(interview_id, session);
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  if (cur.status !== 'scheduled')
    throw new HiringError('CONFLICT', `cannot cancel a ${cur.status} interview`);

  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(interview)
        .set({
          status: 'cancelled',
          outcome_reason: input.input.outcome_reason || null,
          version: next,
          updated_at: new Date(),
        })
        .where(and(eq(interview.id, interview_id), eq(interview.version, cur.version)))
        .returning({ id: interview.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'interview was modified concurrently');

      await recordCandidateEvent(tx, {
        session,
        candidate_id: cur.candidate_id,
        application_id: cur.application_id,
        kind: 'interview_cancelled',
        summary: input.input.outcome_reason
          ? `Interview cancelled — ${input.input.outcome_reason}`
          : 'Interview cancelled',
        detail: { interview_id, outcome_reason: input.input.outcome_reason ?? null },
      });
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.interview',
        aggregateId: interview_id,
        eventType: HIRING_INTERVIEW_OUTCOME_RECORDED,
        eventVersion: 1,
        payload: {
          interview_id,
          application_id: cur.application_id,
          tenant_id: session.tenant_id,
          status: 'cancelled',
        },
      });
    },
  );
  return { version: next };
}

export async function markInterviewNoShow(input: {
  interview_id: string;
  expected_version?: number;
  input: InterviewOutcomeReasonInput;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, interview_id } = input;
  requirePermission(session, 'hiring.candidate.manage');
  const cur = await loadInterview(interview_id, session);
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  if (cur.status !== 'scheduled')
    throw new HiringError('CONFLICT', `cannot mark a ${cur.status} interview as no-show`);

  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(interview)
        .set({
          status: 'no_show',
          outcome_reason: input.input.outcome_reason || null,
          version: next,
          updated_at: new Date(),
        })
        .where(and(eq(interview.id, interview_id), eq(interview.version, cur.version)))
        .returning({ id: interview.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'interview was modified concurrently');

      await recordCandidateEvent(tx, {
        session,
        candidate_id: cur.candidate_id,
        application_id: cur.application_id,
        kind: 'interview_no_show',
        summary: input.input.outcome_reason
          ? `Candidate no-show — ${input.input.outcome_reason}`
          : 'Candidate no-show',
        detail: { interview_id, outcome_reason: input.input.outcome_reason ?? null },
      });
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.interview',
        aggregateId: interview_id,
        eventType: HIRING_INTERVIEW_OUTCOME_RECORDED,
        eventVersion: 1,
        payload: {
          interview_id,
          application_id: cur.application_id,
          tenant_id: session.tenant_id,
          status: 'no_show',
        },
      });
    },
  );
  return { version: next };
}
