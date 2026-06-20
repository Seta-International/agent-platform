import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq, inArray } from 'drizzle-orm';
import { HIRING_REQUISITION_CLOSED, HIRING_REQUISITION_UPDATED } from '../../events.ts';
import { hiringDb } from '../db/client.ts';
import { opening, requisition } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { HiringError, requirePermission } from '../rbac.ts';

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
  from: string[],
  to: string,
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
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, requisition_id, status } = input;
  requirePermission(session, 'hiring.requisition.close');
  const cur = await load(requisition_id, input.expected_version, session);
  if (!['open', 'on_hold'].includes(cur.status)) {
    throw new HiringError('CONFLICT', `cannot close from ${cur.status}`);
  }
  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(requisition)
        .set({ status, closed_at: new Date(), version: next, updated_at: new Date() })
        .where(
          and(
            eq(requisition.id, requisition_id),
            eq(requisition.version, cur.version),
            inArray(requisition.status, ['open', 'on_hold']),
          ),
        )
        .returning({ id: requisition.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'requisition was modified concurrently');
      if (status === 'cancelled') {
        await tx
          .update(opening)
          .set({ status: 'cancelled', closed_at: new Date(), updated_at: new Date() })
          .where(and(eq(opening.requisition_id, requisition_id), eq(opening.status, 'open')));
      }
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.requisition',
        aggregateId: requisition_id,
        eventType: HIRING_REQUISITION_CLOSED,
        eventVersion: 1,
        payload: { requisition_id, tenant_id: session.tenant_id, status },
      });
    },
  );
  return { version: next };
}
