import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  HIRING_APPLICATION_CANCELLED,
  HIRING_REQUISITION_CLOSED,
  HIRING_REQUISITION_UPDATED,
} from '../../events.ts';
import { hiringDb } from '../db/client.ts';
import {
  application,
  opening,
  type REQUISITION_STATUS,
  reason,
  requisition,
} from '../db/schema.ts';
import { HiringError, requirePermission } from '../rbac.ts';
import { recordCandidateEvent } from './candidates.ts';

type RequisitionStatus = (typeof REQUISITION_STATUS)[number];
type Tx = Parameters<Parameters<typeof withEmit>[1]>[0];

/**
 * Settle a requisition as closed (`filled` or `cancelled`) within an existing transaction: flip its
 * status, close its remaining open openings, terminally close every still-active application, and
 * emit the requisition-closed + application-cancelled events. Permission-free by design — callers
 * own their authorization (`closeRequisition` checks `hiring.requisition.close`; the auto-fill path
 * in `hireApplication` is a system consequence of an already-authorized hire). Shared so pressing
 * "Mark filled" and auto-filling the last opening produce identical state and events.
 */
export async function settleRequisitionAsClosed(
  tx: Tx,
  params: {
    session: SessionScope;
    requisition_id: string;
    currentVersion: number;
    status: 'filled' | 'cancelled';
    close_reason_id?: string;
  },
): Promise<{ version: number }> {
  const { session, requisition_id, currentVersion, status, close_reason_id } = params;
  const next = currentVersion + 1;
  const updated = await tx
    .update(requisition)
    .set({
      status,
      close_reason_id,
      closed_at: new Date(),
      version: next,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(requisition.id, requisition_id),
        eq(requisition.version, currentVersion),
        inArray(requisition.status, ['open', 'on_hold']),
      ),
    )
    .returning({ id: requisition.id });
  if (updated.length === 0)
    throw new HiringError('CONFLICT', 'requisition was modified concurrently');
  // Closing a requisition (filled OR cancelled) ends its pipeline: any remaining open
  // openings and every still-active application are terminally closed — hired ones are
  // history and stay hired. Without this, filling a requisition left its other candidates
  // "active" on a board-hidden role (they showed up applying for a role that's gone). The
  // freed candidates surface in the talent pool for re-matching instead of lingering.
  // Cancelled marks the openings cancelled; filled marks them closed (demand met elsewhere).
  await tx
    .update(opening)
    .set({
      status: status === 'cancelled' ? 'cancelled' : 'closed',
      closed_at: new Date(),
      updated_at: new Date(),
    })
    .where(and(eq(opening.requisition_id, requisition_id), eq(opening.status, 'open')));

  // The application status enum has no dedicated "not selected" value, so both outcomes
  // land on 'cancelled' (closed without a hire); the recorded reason keeps them distinct.
  const closeSummary =
    status === 'cancelled'
      ? 'Requisition cancelled — application closed'
      : 'Position filled — application closed';
  const activeApps = await tx
    .update(application)
    .set({
      status: 'cancelled',
      closed_at: new Date(),
      version: sql`${application.version} + 1`,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(application.requisition_id, requisition_id),
        eq(application.status, 'active'),
        tenantScoped(application.tenant_id, session),
      ),
    )
    .returning({
      id: application.id,
      candidate_id: application.candidate_id,
      stage: application.stage,
    });
  for (const app of activeApps) {
    if (app.candidate_id) {
      await recordCandidateEvent(tx, {
        session,
        candidate_id: app.candidate_id,
        application_id: app.id,
        kind: 'cancelled',
        summary: closeSummary,
        detail: { requisition_id, from_stage: app.stage, requisition_status: status },
      });
    }
    await emit({
      tenantId: session.tenant_id,
      aggregateType: 'hiring.application',
      aggregateId: app.id,
      eventType: HIRING_APPLICATION_CANCELLED,
      eventVersion: 1,
      payload: {
        application_id: app.id,
        tenant_id: session.tenant_id,
        requisition_id,
        from_stage: app.stage,
      },
    });
  }
  await emit({
    tenantId: session.tenant_id,
    aggregateType: 'hiring.requisition',
    aggregateId: requisition_id,
    eventType: HIRING_REQUISITION_CLOSED,
    eventVersion: 1,
    payload: { requisition_id, tenant_id: session.tenant_id, status, close_reason_id },
  });
  return { version: next };
}

async function load(requisition_id: string, expected: number | undefined, session: SessionScope) {
  const [r] = await hiringDb()
    .select({ version: requisition.version, status: requisition.status })
    .from(requisition)
    .where(and(eq(requisition.id, requisition_id), tenantScoped(requisition.tenant_id, session)))
    .limit(1);
  if (!r) throw new HiringError('NOT_FOUND', 'requisition not found');
  if (expected !== undefined && expected !== r.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  return r;
}

async function transition(
  requisition_id: string,
  expected: number | undefined,
  from: RequisitionStatus[],
  to: RequisitionStatus,
  session: SessionScope,
): Promise<{ version: number }> {
  requirePermission(session, 'hiring.requisition.manage');
  const cur = await load(requisition_id, expected, session);
  if (!from.includes(cur.status))
    throw new HiringError('CONFLICT', `cannot move from ${cur.status} to ${to}`);
  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(requisition)
        .set({ status: to, version: next, updated_at: new Date() })
        .where(
          and(
            eq(requisition.id, requisition_id),
            eq(requisition.version, cur.version),
            inArray(requisition.status, from),
          ),
        )
        .returning({ id: requisition.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'requisition was modified concurrently');
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.requisition',
        aggregateId: requisition_id,
        eventType: HIRING_REQUISITION_UPDATED,
        eventVersion: 1,
        payload: { requisition_id, tenant_id: session.tenant_id, fields: ['status'] },
      });
    },
  );
  return { version: next };
}

export function holdRequisition(input: {
  requisition_id: string;
  expected_version?: number;
  session: SessionScope;
}) {
  return transition(
    input.requisition_id,
    input.expected_version,
    ['open'],
    'on_hold',
    input.session,
  );
}
export function resumeRequisition(input: {
  requisition_id: string;
  expected_version?: number;
  session: SessionScope;
}) {
  return transition(
    input.requisition_id,
    input.expected_version,
    ['on_hold'],
    'open',
    input.session,
  );
}

export async function closeRequisition(input: {
  requisition_id: string;
  expected_version?: number;
  status: 'filled' | 'cancelled';
  close_reason_id?: string;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, requisition_id, status } = input;
  requirePermission(session, 'hiring.requisition.close');
  const cur = await load(requisition_id, input.expected_version, session);
  if (!['open', 'on_hold'].includes(cur.status)) {
    throw new HiringError('CONFLICT', `cannot close from ${cur.status}`);
  }
  // Cancelling always records why (feeds demand-metrics reporting); filling a requisition has
  // no reason to record — the close_reason_id column is meaningless once a hire happened.
  let close_reason_id: string | undefined;
  if (status === 'cancelled') {
    if (!input.close_reason_id) throw new HiringError('VALIDATION', 'close_reason_id is required');
    const [reasonRow] = await hiringDb()
      .select({ id: reason.id })
      .from(reason)
      .where(
        and(
          eq(reason.id, input.close_reason_id),
          eq(reason.kind, 'opening_close'),
          tenantScoped(reason.tenant_id, session),
        ),
      )
      .limit(1);
    if (!reasonRow) throw new HiringError('VALIDATION', 'unknown close reason');
    close_reason_id = input.close_reason_id;
  }
  let result!: { version: number };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      result = await settleRequisitionAsClosed(tx, {
        session,
        requisition_id,
        currentVersion: cur.version,
        status,
        close_reason_id,
      });
    },
  );
  return result;
}
