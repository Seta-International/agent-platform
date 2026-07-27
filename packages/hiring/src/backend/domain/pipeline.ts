import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { createWorker, employmentPeriod, getWorkerIdForUser, peopleDb } from '@seta/people';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, isNull } from 'drizzle-orm';
import type { RejectApplicationInput, TransferApplicationInput } from '../../contracts.ts';
import {
  HIRING_APPLICATION_CREATED,
  HIRING_APPLICATION_HIRED,
  HIRING_APPLICATION_REJECTED,
  HIRING_APPLICATION_STAGE_CHANGED,
  HIRING_APPLICATION_TRANSFERRED,
  HIRING_REQUISITION_UPDATED,
} from '../../events.ts';
import { hiringDb } from '../db/client.ts';
import { application, candidate, opening, reason, requisition } from '../db/schema.ts';
import { HiringError, requirePermission } from '../rbac.ts';
import { assertApplicationRequisitionNotOnHold, recordCandidateEvent } from './candidates.ts';

const REQ_STAGE_ORDER = ['sourcing', 'screening', 'interview', 'offer'] as const;
type ReqStage = (typeof REQ_STAGE_ORDER)[number];
const APP_TO_REQ_STAGE: Record<string, ReqStage> = {
  new: 'sourcing',
  screening: 'screening',
  interview: 'interview',
  offer: 'offer',
};

export async function moveApplicationStage(input: {
  application_id: string;
  expected_version?: number;
  to: 'new' | 'screening' | 'interview' | 'offer';
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, application_id } = input;
  requirePermission(session, 'hiring.candidate.manage');
  const [cur] = await hiringDb()
    .select({
      version: application.version,
      stage: application.stage,
      status: application.status,
      candidate_id: application.candidate_id,
      requisition_id: application.requisition_id,
    })
    .from(application)
    .where(and(eq(application.id, application_id), tenantScoped(application.tenant_id, session)))
    .limit(1);
  if (!cur) throw new HiringError('NOT_FOUND', 'application not found');
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  if (cur.status !== 'active')
    throw new HiringError(
      'CONFLICT',
      `cannot move a ${cur.status} application — only active applications may advance`,
    );
  await assertApplicationRequisitionNotOnHold(application_id, session);
  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(application)
        .set({ stage: input.to, version: next, updated_at: new Date() })
        .where(
          and(
            eq(application.id, application_id),
            eq(application.version, cur.version),
            eq(application.status, 'active'),
          ),
        )
        .returning({ id: application.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'application was modified concurrently');

      // Auto-advance requisition.stage (AC2: FUT-325): when a candidate reaches a pipeline
      // stage ahead of the requisition's current stage, bump the requisition to match so
      // both the Board and List views report the same most-advanced stage.
      const targetReqStage = APP_TO_REQ_STAGE[input.to];
      if (cur.requisition_id && targetReqStage) {
        const [req] = await tx
          .select({
            stage: requisition.stage,
            version: requisition.version,
            status: requisition.status,
          })
          .from(requisition)
          .where(eq(requisition.id, cur.requisition_id))
          .limit(1);
        if (req) {
          const targetIdx = REQ_STAGE_ORDER.indexOf(
            targetReqStage as (typeof REQ_STAGE_ORDER)[number],
          );
          const curIdx = REQ_STAGE_ORDER.indexOf(req.stage as (typeof REQ_STAGE_ORDER)[number]);
          if (targetIdx > curIdx && req.status === 'open') {
            // Version-gated update inside the tx — concurrent hold/close between
            // assertApplicationRequisitionNotOnHold and withEmit would change the version
            // or status, making the WHERE miss and returning 0 rows — safe no-op.
            const updatedReq = await tx
              .update(requisition)
              .set({ stage: targetReqStage, version: req.version + 1, updated_at: new Date() })
              .where(
                and(
                  eq(requisition.id, cur.requisition_id),
                  eq(requisition.version, req.version),
                  eq(requisition.status, 'open'),
                ),
              )
              .returning({ id: requisition.id });
            if (updatedReq.length > 0) {
              await emit({
                tenantId: session.tenant_id,
                aggregateType: 'hiring.requisition',
                aggregateId: cur.requisition_id,
                eventType: HIRING_REQUISITION_UPDATED,
                eventVersion: 1,
                payload: {
                  requisition_id: cur.requisition_id,
                  tenant_id: session.tenant_id,
                  fields: ['stage'],
                },
              });
            }
          }
        }
      }

      if (cur.candidate_id) {
        await recordCandidateEvent(tx, {
          session,
          candidate_id: cur.candidate_id,
          application_id,
          kind: 'stage_changed',
          summary: `Moved ${cur.stage} → ${input.to}`,
          detail: { from: cur.stage, to: input.to },
        });
      }
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.application',
        aggregateId: application_id,
        eventType: HIRING_APPLICATION_STAGE_CHANGED,
        eventVersion: 1,
        payload: { application_id, tenant_id: session.tenant_id, from: cur.stage, to: input.to },
      });
    },
  );
  return { version: next };
}

export async function rejectApplication(input: {
  application_id: string;
  expected_version?: number;
  input: RejectApplicationInput;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, application_id } = input;
  requirePermission(session, 'hiring.candidate.reject');
  const [cur] = await hiringDb()
    .select({
      version: application.version,
      status: application.status,
      candidate_id: application.candidate_id,
    })
    .from(application)
    .where(and(eq(application.id, application_id), tenantScoped(application.tenant_id, session)))
    .limit(1);
  if (!cur) throw new HiringError('NOT_FOUND', 'application not found');
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  if (cur.status !== 'active')
    throw new HiringError(
      'CONFLICT',
      `cannot reject a ${cur.status} application — only active applications may be rejected`,
    );
  await assertApplicationRequisitionNotOnHold(application_id, session);
  // The free-text reason is the record; the catalog id is an optional classification —
  // when absent, the event categorizes as 'other' so downstream consumers keep a category.
  let category: string = 'other';
  if (input.input.reason_id) {
    const [reasonRow] = await hiringDb()
      .select({ category: reason.category })
      .from(reason)
      .where(
        and(
          eq(reason.id, input.input.reason_id),
          eq(reason.kind, 'rejection'),
          tenantScoped(reason.tenant_id, session),
        ),
      )
      .limit(1);
    if (!reasonRow) throw new HiringError('VALIDATION', 'unknown rejection reason');
    category = reasonRow.category ?? 'other';
  }
  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(application)
        .set({
          status: 'rejected',
          rejection_reason_id: input.input.reason_id ?? null,
          tags: input.input.tags,
          note: input.input.reason,
          closed_at: new Date(),
          version: next,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(application.id, application_id),
            eq(application.version, cur.version),
            eq(application.status, 'active'),
          ),
        )
        .returning({ id: application.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'application was modified concurrently');
      if (cur.candidate_id) {
        await recordCandidateEvent(tx, {
          session,
          candidate_id: cur.candidate_id,
          application_id,
          kind: 'rejected',
          summary: `Rejected — ${input.input.reason}`,
          detail: { reason_id: input.input.reason_id ?? null, tags: input.input.tags },
        });
      }
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.application',
        aggregateId: application_id,
        eventType: HIRING_APPLICATION_REJECTED,
        eventVersion: 1,
        payload: {
          application_id,
          tenant_id: session.tenant_id,
          reason_id: input.input.reason_id ?? null,
          category: category as 'rejected_by_us' | 'withdrew' | 'other',
        },
      });
    },
  );
  return { version: next };
}

export async function transferApplication(input: {
  application_id: string;
  expected_version?: number;
  input: TransferApplicationInput;
  session: SessionScope;
}): Promise<{ version: number; to_application_id: string }> {
  const { session, application_id } = input;
  const target = input.input.target_requisition_id;
  requirePermission(session, 'hiring.candidate.transfer');
  const [cur] = await hiringDb()
    .select({
      version: application.version,
      status: application.status,
      candidate_id: application.candidate_id,
    })
    .from(application)
    .where(and(eq(application.id, application_id), tenantScoped(application.tenant_id, session)))
    .limit(1);
  if (!cur) throw new HiringError('NOT_FOUND', 'application not found');
  if (!cur.candidate_id) throw new HiringError('VALIDATION', 'only external applications transfer');
  const candidateId: string = cur.candidate_id;
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  if (cur.status !== 'active')
    throw new HiringError('CONFLICT', `cannot transfer a ${cur.status} application`);
  await assertApplicationRequisitionNotOnHold(application_id, session);

  const [req] = await hiringDb()
    .select({ id: requisition.id, status: requisition.status })
    .from(requisition)
    .where(and(eq(requisition.id, target), tenantScoped(requisition.tenant_id, session)))
    .limit(1);
  if (!req) throw new HiringError('NOT_FOUND', 'target requisition not found');
  // FUT-559: a role that isn't actively hiring (on hold, filled, cancelled) never receives
  // transfers — otherwise candidates pile up on positions nobody is working.
  if (req.status !== 'open')
    throw new HiringError('VALIDATION', 'target requisition is not open for applications');

  const dup = await hiringDb()
    .select({ id: application.id })
    .from(application)
    .where(
      and(
        eq(application.requisition_id, target),
        eq(application.candidate_id, candidateId),
        eq(application.status, 'active'),
        tenantScoped(application.tenant_id, session),
      ),
    )
    .limit(1);
  if (dup.length > 0)
    throw new HiringError('CONFLICT', 'candidate already has an active application on the target');

  const next = cur.version + 1;
  let toId!: string;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [created] = await tx
        .insert(application)
        .values({
          tenant_id: session.tenant_id,
          requisition_id: target,
          kind: 'external',
          candidate_id: candidateId,
          stage: 'new',
          status: 'active',
        })
        .returning({ id: application.id });
      if (!created) throw new Error('transfer target application insert returned no row');
      toId = created.id;

      const updated = await tx
        .update(application)
        .set({
          status: 'transferred',
          superseded_by_application_id: created.id,
          closed_at: new Date(),
          version: next,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(application.id, application_id),
            eq(application.version, cur.version),
            eq(application.status, 'active'),
          ),
        )
        .returning({ id: application.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'application was modified concurrently');

      await recordCandidateEvent(tx, {
        session,
        candidate_id: candidateId,
        application_id,
        kind: 'transferred',
        summary: `Transferred to requisition ${target}`,
        detail: { to_application_id: created.id, target_requisition_id: target },
      });
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.application',
        aggregateId: application_id,
        eventType: HIRING_APPLICATION_TRANSFERRED,
        eventVersion: 1,
        payload: {
          application_id,
          to_application_id: created.id,
          target_requisition_id: target,
          tenant_id: session.tenant_id,
        },
      });
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.application',
        aggregateId: created.id,
        eventType: HIRING_APPLICATION_CREATED,
        eventVersion: 1,
        payload: {
          application_id: created.id,
          candidate_id: candidateId,
          requisition_id: target,
          tenant_id: session.tenant_id,
        },
      });
    },
  );
  return { version: next, to_application_id: toId };
}

export async function hireApplication(input: {
  application_id: string;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, application_id } = input;
  requirePermission(session, 'hiring.candidate.manage');

  const [appRow] = await hiringDb()
    .select({
      id: application.id,
      version: application.version,
      status: application.status,
      stage: application.stage,
      kind: application.kind,
      candidate_id: application.candidate_id,
      requisition_id: application.requisition_id,
    })
    .from(application)
    .where(and(eq(application.id, application_id), tenantScoped(application.tenant_id, session)))
    .limit(1);

  if (!appRow) throw new HiringError('NOT_FOUND', 'application not found');
  if (input.expected_version !== undefined && input.expected_version !== appRow.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  if (appRow.status !== 'active')
    throw new HiringError(
      'CONFLICT',
      `cannot hire a ${appRow.status} application — only active applications may be hired`,
    );
  await assertApplicationRequisitionNotOnHold(application_id, session);

  if (!appRow.candidate_id) throw new HiringError('VALIDATION', 'candidate not found');
  const [candRow] = await hiringDb()
    .select()
    .from(candidate)
    .where(and(eq(candidate.id, appRow.candidate_id), tenantScoped(candidate.tenant_id, session)))
    .limit(1);
  if (!candRow) throw new HiringError('NOT_FOUND', 'candidate not found');

  const [reqRow] = await hiringDb()
    .select({
      title: requisition.title,
      role_title: requisition.role_title,
    })
    .from(requisition)
    .where(
      and(eq(requisition.id, appRow.requisition_id), tenantScoped(requisition.tenant_id, session)),
    )
    .limit(1);
  if (!reqRow) throw new HiringError('NOT_FOUND', 'requisition not found');

  const [openOpening] = await hiringDb()
    .select({
      id: opening.id,
      version: opening.version,
    })
    .from(opening)
    .where(
      and(
        eq(opening.requisition_id, appRow.requisition_id),
        eq(opening.status, 'open'),
        tenantScoped(opening.tenant_id, session),
      ),
    )
    .limit(1);

  if (!openOpening) {
    throw new HiringError('CONFLICT', 'No vacant openings for this requisition');
  }

  let worker_id: string;

  const existingWorkerId =
    appRow.kind === 'internal'
      ? (session.person_id ??
        (session.user_id ? await getWorkerIdForUser(session.user_id, session.tenant_id) : null))
      : null;

  if (existingWorkerId) {
    worker_id = existingWorkerId;
    const newJobTitle = reqRow.role_title || reqRow.title;
    const updatedJobTitle = await peopleDb()
      .update(employmentPeriod)
      .set({ job_title: newJobTitle, updated_at: new Date() })
      .where(
        and(
          eq(employmentPeriod.person_id, worker_id),
          isNull(employmentPeriod.end_date),
          tenantScoped(employmentPeriod.tenant_id, session),
        ),
      )
      .returning({ id: employmentPeriod.id });

    if (updatedJobTitle.length === 0) {
      await peopleDb().insert(employmentPeriod).values({
        tenant_id: session.tenant_id,
        person_id: worker_id,
        seq: 1,
        lifecycle_stage: 'active',
        job_title: newJobTitle,
      });
    }
  } else {
    const contact = candRow.contact as { personal_email?: string; phone?: string } | null;
    const created = await createWorker({
      full_name: candRow.name,
      personal_email: contact?.personal_email || undefined,
      phone: contact?.phone || undefined,
      dob: candRow.dob || undefined,
      gender: candRow.gender || undefined,
      job_title: reqRow.role_title || reqRow.title,
      session,
    });
    worker_id = created.worker_id;
  }

  const nextAppVersion = appRow.version + 1;
  const nextOpeningVersion = openOpening.version + 1;

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updatedApp = await tx
        .update(application)
        .set({
          status: 'hired',
          person_id: worker_id,
          closed_at: new Date(),
          version: nextAppVersion,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(application.id, application_id),
            eq(application.version, appRow.version),
            eq(application.status, 'active'),
          ),
        )
        .returning({ id: application.id });

      if (updatedApp.length === 0)
        throw new HiringError('CONFLICT', 'application was modified concurrently');

      const updatedOpening = await tx
        .update(opening)
        .set({
          status: 'filled',
          hired_application_id: application_id,
          version: nextOpeningVersion,
          closed_at: new Date(),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(opening.id, openOpening.id),
            eq(opening.version, openOpening.version),
            eq(opening.status, 'open'),
          ),
        )
        .returning({ id: opening.id });

      if (updatedOpening.length === 0)
        throw new HiringError('CONFLICT', 'opening was modified concurrently');

      await recordCandidateEvent(tx, {
        session,
        candidate_id: candRow.id,
        application_id,
        kind: 'hired',
        summary: `Hired to position ${reqRow.role_title || reqRow.title}`,
        detail: { worker_id, opening_id: openOpening.id },
      });

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.application',
        aggregateId: application_id,
        eventType: HIRING_APPLICATION_HIRED,
        eventVersion: 1,
        payload: {
          application_id,
          tenant_id: session.tenant_id,
          from_stage: appRow.stage,
        },
      });
    },
  );

  return { version: nextAppVersion };
}
