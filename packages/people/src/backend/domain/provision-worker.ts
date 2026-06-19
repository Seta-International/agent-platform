import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import type { ProvisionWorkerInput } from '../../contracts.ts';
import { employmentPeriod, person, worker, workerHistory } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';

export async function provisionWorker(
  input: ProvisionWorkerInput & { session: SessionScope },
): Promise<{ worker_id: string }> {
  requirePermission(input.session, 'people.worker.provision');

  let workerId!: string;
  await withEmit(
    {
      actor: { userId: input.session.user_id, tenantId: input.session.tenant_id },
    },
    async (tx) => {
      const [p] = await tx
        .insert(person)
        .values({
          tenant_id: input.session.tenant_id,
          original_hire_date: input.start_date,
          seniority_date: input.start_date,
        })
        .returning();
      if (!p) throw new Error('person insert returned no row');

      await tx.insert(employmentPeriod).values({
        tenant_id: input.session.tenant_id,
        person_id: p.id,
        seq: 1,
        start_date: input.start_date,
        end_date: null,
        status: 'active',
        lifecycle_stage: 'preboarding',
        employment_type: input.employment_type,
      });

      await tx.insert(worker).values({
        tenant_id: input.session.tenant_id,
        person_id: p.id,
        full_name: input.full_name,
      });

      await tx.insert(workerHistory).values({
        tenant_id: input.session.tenant_id,
        person_id: p.id,
        action: 'provisioned',
        by_user_id: input.session.user_id,
      });

      // worker_id is the person id (db-design: person.id = cross-module worker_id).
      await emit({
        tenantId: input.session.tenant_id,
        aggregateType: 'people.worker',
        aggregateId: p.id,
        eventType: 'people.worker.created',
        eventVersion: 1,
        payload: { worker_id: p.id, tenant_id: input.session.tenant_id },
      });

      workerId = p.id;
    },
  );

  return { worker_id: workerId };
}
