import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { type CreateAllocationInput, createAllocationInput } from '../../contracts.ts';
import { PM_ALLOCATION_CREATED } from '../../events.ts';
import { account, allocation, project } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { PmError, requirePermission } from '../rbac.ts';

export async function createAllocation(
  input: CreateAllocationInput & { session: SessionScope },
): Promise<{ allocation_id: string }> {
  const { session } = input;
  requirePermission(session, 'pm.project.manage');
  const parsed = createAllocationInput.parse(input);

  let result!: { allocation_id: string };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const proj = await tx
        .select({
          id: project.id,
          account_id: project.account_id,
          pm_worker_id: project.pm_worker_id,
        })
        .from(project)
        .where(and(eq(project.id, parsed.project_id), tenantScoped(project.tenant_id, session)))
        .limit(1);
      if (!proj[0]) throw new PmError('NOT_FOUND', `project ${parsed.project_id} not found`);

      const [acc] = await tx
        .select({ name: account.name })
        .from(account)
        .where(and(eq(account.id, proj[0].account_id), tenantScoped(account.tenant_id, session)))
        .limit(1);
      if (!acc) throw new PmError('NOT_FOUND', `account ${proj[0].account_id} not found`);

      const [row] = await tx
        .insert(allocation)
        .values({
          tenant_id: session.tenant_id,
          project_id: parsed.project_id,
          worker_id: parsed.worker_id ?? null,
          role: parsed.role ?? null,
          date_from: parsed.date_from ?? null,
          date_to: parsed.date_to ?? null,
          bucket: parsed.bucket,
          planned_pct: parsed.planned_pct?.toString() ?? null,
          minutes_per_day: parsed.minutes_per_day ?? null,
          status: parsed.status,
          note: parsed.note ?? null,
        })
        .returning({ id: allocation.id });
      if (!row) throw new Error('allocation insert returned no row');
      result = { allocation_id: row.id };

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.allocation',
        aggregateId: row.id,
        eventType: PM_ALLOCATION_CREATED,
        eventVersion: 1,
        payload: {
          allocation_id: row.id,
          project_id: parsed.project_id,
          worker_id: parsed.worker_id ?? null,
          tenant_id: session.tenant_id,
          account_id: proj[0].account_id,
          account_name: acc.name,
          lead_worker_id: proj[0].pm_worker_id ?? null,
          date_from: parsed.date_from ?? null,
          date_to: parsed.date_to ?? null,
          planned_pct: parsed.planned_pct ?? null,
          bucket: parsed.bucket,
        },
      });
    },
  );
  return result;
}
