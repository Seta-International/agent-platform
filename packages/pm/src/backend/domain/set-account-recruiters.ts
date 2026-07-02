import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import type { SetAccountRecruitersInput } from '../../contracts.ts';
import { PM_ACCOUNT_RECRUITER_ASSIGNED, PM_ACCOUNT_RECRUITER_UNASSIGNED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { account, accountRecruiter } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';

export async function setAccountRecruiters(
  input: SetAccountRecruitersInput & { session: SessionScope },
): Promise<{ added: number; removed: number }> {
  const { session, account_id, recruiter_worker_ids } = input;
  requirePermission(session, 'pm.account.manage');

  const [a] = await pmDb()
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.id, account_id), tenantScoped(account.tenant_id, session)))
    .limit(1);
  if (!a) throw new PmError('NOT_FOUND', 'account not found');

  const existing = await pmDb()
    .select({ id: accountRecruiter.recruiter_worker_id })
    .from(accountRecruiter)
    .where(
      and(
        eq(accountRecruiter.account_id, account_id),
        tenantScoped(accountRecruiter.tenant_id, session),
      ),
    );
  const existingSet = new Set(existing.map((r) => r.id));
  const desiredSet = new Set(recruiter_worker_ids);
  const toAdd = recruiter_worker_ids.filter((id) => !existingSet.has(id));
  const toRemove = [...existingSet].filter((id) => !desiredSet.has(id));
  if (toAdd.length === 0 && toRemove.length === 0) return { added: 0, removed: 0 };

  let added = 0;
  let removed = 0;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      for (const rid of toAdd) {
        // onConflictDoNothing: concurrent set-edits must not crash on the unique index; events track actual effect.
        const inserted = await tx
          .insert(accountRecruiter)
          .values({ tenant_id: session.tenant_id, account_id, recruiter_worker_id: rid })
          .onConflictDoNothing()
          .returning({ id: accountRecruiter.id });
        if (inserted.length > 0) {
          await emit({
            tenantId: session.tenant_id,
            aggregateType: 'pm.account',
            aggregateId: account_id,
            eventType: PM_ACCOUNT_RECRUITER_ASSIGNED,
            eventVersion: 1,
            payload: { account_id, tenant_id: session.tenant_id, recruiter_worker_id: rid },
          });
          added += 1;
        }
      }
      for (const rid of toRemove) {
        const deleted = await tx
          .delete(accountRecruiter)
          .where(
            and(
              eq(accountRecruiter.account_id, account_id),
              eq(accountRecruiter.recruiter_worker_id, rid),
              eq(accountRecruiter.tenant_id, session.tenant_id),
            ),
          )
          .returning({ id: accountRecruiter.id });
        if (deleted.length > 0) {
          await emit({
            tenantId: session.tenant_id,
            aggregateType: 'pm.account',
            aggregateId: account_id,
            eventType: PM_ACCOUNT_RECRUITER_UNASSIGNED,
            eventVersion: 1,
            payload: { account_id, tenant_id: session.tenant_id, recruiter_worker_id: rid },
          });
          removed += 1;
        }
      }
    },
  );
  return { added, removed };
}
