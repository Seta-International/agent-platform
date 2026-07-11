import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import type { CreateAccountInput } from '../../contracts.ts';
import { PM_ACCOUNT_CREATED, PM_ACCOUNT_RECRUITER_ASSIGNED } from '../../events.ts';
import { account, accountRecruiter } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';

export async function createAccount(
  input: CreateAccountInput & { session: SessionScope },
): Promise<{ account_id: string }> {
  requirePermission(input.session, 'pm.account.manage');
  let result!: { account_id: string };
  await withEmit(
    { actor: { userId: input.session.user_id, tenantId: input.session.tenant_id } },
    async (tx) => {
      const [row] = await tx
        .insert(account)
        .values({
          tenant_id: input.session.tenant_id,
          name: input.name,
          industry: input.industry,
          am_person_id: input.am_worker_id,
        })
        .returning();
      if (!row) throw new Error('account insert returned no row');
      result = { account_id: row.id };
      await emit({
        tenantId: input.session.tenant_id,
        aggregateType: 'pm.account',
        aggregateId: row.id,
        eventType: PM_ACCOUNT_CREATED,
        eventVersion: 1,
        payload: {
          account_id: row.id,
          tenant_id: input.session.tenant_id,
          name: row.name,
          am_worker_id: row.am_person_id ?? null,
        },
      });

      for (const rid of input.recruiter_worker_ids ?? []) {
        await tx.insert(accountRecruiter).values({
          tenant_id: input.session.tenant_id,
          account_id: row.id,
          recruiter_worker_id: rid,
        });
        await emit({
          tenantId: input.session.tenant_id,
          aggregateType: 'pm.account',
          aggregateId: row.id,
          eventType: PM_ACCOUNT_RECRUITER_ASSIGNED,
          eventVersion: 1,
          payload: {
            account_id: row.id,
            tenant_id: input.session.tenant_id,
            recruiter_worker_id: rid,
          },
        });
      }
    },
  );
  return result;
}
