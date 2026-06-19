import { emit } from '@seta/core/events';
import type { NodeTx } from '@seta/shared-db';
import { employmentPeriod, person, worker, workerHistory } from '../db/schema.ts';

export interface InsertWorkerArgs {
  tenant_id: string;
  by_user_id: string | null;
  full_name: string;
  work_email?: string | null;
  start_date?: string | null;
  employment_type?: string | null;
  dob?: string | null;
  gender?: string | null;
  phone?: string | null;
  emergency_contact?: unknown;
  history_action: 'provisioned' | 'created';
}

export async function insertWorkerAggregate(
  tx: NodeTx,
  args: InsertWorkerArgs,
): Promise<{ worker_id: string }> {
  const [p] = await tx
    .insert(person)
    .values({
      tenant_id: args.tenant_id,
      original_hire_date: args.start_date ?? null,
      seniority_date: args.start_date ?? null,
    })
    .returning();
  if (!p) throw new Error('person insert returned no row');

  await tx.insert(employmentPeriod).values({
    tenant_id: args.tenant_id,
    person_id: p.id,
    seq: 1,
    start_date: args.start_date ?? null,
    end_date: null,
    status: 'active',
    lifecycle_stage: 'preboarding',
    employment_type: args.employment_type ?? null,
  });

  await tx.insert(worker).values({
    tenant_id: args.tenant_id,
    person_id: p.id,
    full_name: args.full_name,
    work_email: args.work_email ?? null,
    dob: args.dob ?? null,
    gender: args.gender ?? null,
    phone: args.phone ?? null,
    emergency_contact: args.emergency_contact ?? null,
  });

  await tx.insert(workerHistory).values({
    tenant_id: args.tenant_id,
    person_id: p.id,
    action: args.history_action,
    by_user_id: args.by_user_id,
  });

  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'people.worker',
    aggregateId: p.id,
    eventType: 'people.worker.created',
    eventVersion: 1,
    payload: { worker_id: p.id, tenant_id: args.tenant_id },
  });

  return { worker_id: p.id };
}
