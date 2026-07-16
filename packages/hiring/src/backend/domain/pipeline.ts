import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import type { RejectApplicationInput, TransferApplicationInput } from '../../contracts.ts';
import {
  HIRING_APPLICATION_CREATED,
  HIRING_APPLICATION_HIRED,
  HIRING_APPLICATION_REJECTED,
  HIRING_APPLICATION_STAGE_CHANGED,
  HIRING_APPLICATION_TRANSFERRED,
} from '../../events.ts';
import { hiringDb } from '../db/client.ts';
import { application, reason, requisition } from '../db/schema.ts';
import { HiringError, requirePermission } from '../rbac.ts';
import { assertApplicationRequisitionNotOnHold, recordCandidateEvent } from './candidates.ts';

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

export async function hireApplication(input: {
  application_id: string;
  expected_version?: number;
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
      `cannot hire a ${cur.status} application — only active applications may be hired`,
    );
  await assertApplicationRequisitionNotOnHold(application_id, session);
  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(application)
        .set({ status: 'hired', closed_at: new Date(), version: next, updated_at: new Date() })
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
          kind: 'hired',
          summary: `Hired — from ${cur.stage}`,
          detail: { from_stage: cur.stage },
        });
      }
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.application',
        aggregateId: application_id,
        eventType: HIRING_APPLICATION_HIRED,
        eventVersion: 1,
        payload: { application_id, tenant_id: session.tenant_id, from_stage: cur.stage },
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
  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(application)
        .set({
          status: 'rejected',
          rejection_reason_id: input.input.reason_id,
          tags: input.input.tags,
          note: input.input.note ?? null,
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
          summary: `Rejected — ${reasonRow.category}`,
          detail: { reason_id: input.input.reason_id, tags: input.input.tags },
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
          reason_id: input.input.reason_id,
          category: reasonRow.category as 'rejected_by_us' | 'withdrew' | 'other',
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
