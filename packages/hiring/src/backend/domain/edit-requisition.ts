import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import type { EditRequisitionPatch } from '../../contracts.ts';
import { HIRING_REQUISITION_UPDATED } from '../../events.ts';
import { hiringDb } from '../db/client.ts';
import { requisition } from '../db/schema.ts';
import { HiringError, requirePermission } from '../rbac.ts';

export async function editRequisition(input: {
  requisition_id: string;
  expected_version?: number;
  patch: EditRequisitionPatch;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, requisition_id, patch } = input;
  requirePermission(session, 'hiring.requisition.manage');

  const [current] = await hiringDb()
    .select()
    .from(requisition)
    .where(and(eq(requisition.id, requisition_id), tenantScoped(requisition.tenant_id, session)))
    .limit(1);
  if (!current) throw new HiringError('NOT_FOUND', 'requisition not found');
  if (input.expected_version !== undefined && input.expected_version !== current.version) {
    throw new HiringError('CONFLICT', 'version mismatch');
  }

  const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [string, unknown][];
  const changes = entries.filter(
    ([f, v]) => JSON.stringify((current as Record<string, unknown>)[f]) !== JSON.stringify(v),
  );
  if (changes.length === 0) return { version: current.version };

  const nextVersion = current.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const set: Record<string, unknown> = { version: nextVersion, updated_at: new Date() };
      for (const [f, v] of changes) set[f] = v;
      const updated = await tx
        .update(requisition)
        .set(set)
        .where(and(eq(requisition.id, requisition_id), eq(requisition.version, current.version)))
        .returning({ id: requisition.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'requisition was modified concurrently');
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.requisition',
        aggregateId: requisition_id,
        eventType: HIRING_REQUISITION_UPDATED,
        eventVersion: 1,
        payload: { requisition_id, tenant_id: session.tenant_id, fields: changes.map(([f]) => f) },
      });
    },
  );
  return { version: nextVersion };
}
