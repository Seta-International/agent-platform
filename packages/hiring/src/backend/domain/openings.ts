import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq, sql } from 'drizzle-orm';
import type { AddOpeningInput, CloseOpeningInput } from '../../contracts.ts';
import { HIRING_OPENING_CLOSED, HIRING_OPENING_OPENED } from '../../events.ts';
import { hiringDb } from '../db/client.ts';
import { opening, requisition } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { HiringError, requirePermission } from '../rbac.ts';

export async function addOpening(input: {
  requisition_id: string;
  input: AddOpeningInput;
  session: SessionScope;
}): Promise<{ opening_id: string; seq: number }> {
  const { session, requisition_id } = input;
  requirePermission(session, 'hiring.requisition.manage');
  const [req] = await hiringDb()
    .select({ id: requisition.id })
    .from(requisition)
    .where(and(eq(requisition.id, requisition_id), tenantScoped(requisition.tenant_id, session)))
    .limit(1);
  if (!req) throw new HiringError('NOT_FOUND', 'requisition not found');

  let result!: { opening_id: string; seq: number };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${opening.seq}),0)::int + 1` })
        .from(opening)
        .where(eq(opening.requisition_id, requisition_id));
      const [op] = await tx
        .insert(opening)
        .values({
          tenant_id: session.tenant_id,
          requisition_id,
          seq: next,
          resource_request_id: input.input.resource_request_id,
          position_id: input.input.position_id,
        })
        .returning({ id: opening.id, seq: opening.seq });
      if (!op) throw new Error('opening insert returned no row');
      result = { opening_id: op.id, seq: op.seq };
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.opening',
        aggregateId: op.id,
        eventType: HIRING_OPENING_OPENED,
        eventVersion: 1,
        payload: {
          opening_id: op.id,
          requisition_id,
          tenant_id: session.tenant_id,
          resource_request_id: input.input.resource_request_id,
        },
      });
    },
  );
  return result;
}

export async function closeOpening(input: {
  opening_id: string;
  expected_version?: number;
  input: CloseOpeningInput;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, opening_id } = input;
  requirePermission(session, 'hiring.requisition.manage');
  const [cur] = await hiringDb()
    .select({
      version: opening.version,
      status: opening.status,
      requisition_id: opening.requisition_id,
    })
    .from(opening)
    .where(and(eq(opening.id, opening_id), tenantScoped(opening.tenant_id, session)))
    .limit(1);
  if (!cur) throw new HiringError('NOT_FOUND', 'opening not found');
  if (input.expected_version !== undefined && input.expected_version !== cur.version) {
    throw new HiringError('CONFLICT', 'version mismatch');
  }
  if (cur.status !== 'open') throw new HiringError('CONFLICT', `cannot close from ${cur.status}`);
  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(opening)
        .set({
          status: input.input.status,
          close_reason_id: input.input.close_reason_id,
          closed_at: new Date(),
          version: next,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(opening.id, opening_id),
            eq(opening.version, cur.version),
            eq(opening.status, 'open'),
          ),
        )
        .returning({ id: opening.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'opening was modified concurrently');
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.opening',
        aggregateId: opening_id,
        eventType: HIRING_OPENING_CLOSED,
        eventVersion: 1,
        payload: {
          opening_id,
          requisition_id: cur.requisition_id,
          tenant_id: session.tenant_id,
          status: input.input.status,
          reason_id: input.input.close_reason_id,
        },
      });
    },
  );
  return { version: next };
}
