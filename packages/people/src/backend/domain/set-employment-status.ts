import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, isNull, max } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { employmentPeriod, worker } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

async function loadWorker(worker_id: string, session: SessionScope) {
  const [row] = await peopleDb()
    .select({ person_id: worker.person_id })
    .from(worker)
    .where(and(eq(worker.person_id, worker_id), tenantScoped(worker.tenant_id, session)))
    .limit(1);
  if (!row) throw new PeopleError('NOT_FOUND', 'worker not found');
  return row;
}

export async function terminateWorker(input: {
  worker_id: string;
  session: SessionScope;
}): Promise<{ status: 'terminated' }> {
  const { session, worker_id } = input;
  requirePermission(session, 'people.worker.manage');
  const { person_id } = await loadWorker(worker_id, session);

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const closed = await tx
        .update(employmentPeriod)
        .set({
          end_date: new Date().toISOString().slice(0, 10),
          lifecycle_stage: 'alumni',
          updated_at: new Date(),
        })
        .where(and(eq(employmentPeriod.person_id, person_id), isNull(employmentPeriod.end_date)))
        .returning({ id: employmentPeriod.id });
      if (closed.length === 0) throw new PeopleError('CONFLICT', 'worker is not active');
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.worker',
        aggregateId: worker_id,
        eventType: 'people.worker.terminated',
        eventVersion: 1,
        payload: { worker_id, person_id, tenant_id: session.tenant_id },
      });
    },
  );
  return { status: 'terminated' };
}

export async function reinstateWorker(input: {
  worker_id: string;
  session: SessionScope;
}): Promise<{ status: 'active' }> {
  const { session, worker_id } = input;
  requirePermission(session, 'people.worker.manage');
  const { person_id } = await loadWorker(worker_id, session);

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [openPeriod] = await tx
        .select({ id: employmentPeriod.id })
        .from(employmentPeriod)
        .where(and(eq(employmentPeriod.person_id, person_id), isNull(employmentPeriod.end_date)))
        .limit(1);
      if (openPeriod) throw new PeopleError('CONFLICT', 'worker is already active');
      const rows = await tx
        .select({ seq: max(employmentPeriod.seq) })
        .from(employmentPeriod)
        .where(eq(employmentPeriod.person_id, person_id));
      const maxSeq = rows[0]?.seq ?? 0;
      await tx.insert(employmentPeriod).values({
        tenant_id: session.tenant_id,
        person_id,
        seq: maxSeq + 1,
        start_date: new Date().toISOString().slice(0, 10),
        lifecycle_stage: 'active',
      });
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.worker',
        aggregateId: worker_id,
        eventType: 'people.worker.reinstated',
        eventVersion: 1,
        payload: { worker_id, person_id, tenant_id: session.tenant_id },
      });
    },
  );
  return { status: 'active' };
}
