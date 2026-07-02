import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import type { EditAccountInput } from '../../contracts.ts';
import { PM_ACCOUNT_UPDATED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { account } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';

export async function editAccount(
  input: EditAccountInput & { session: SessionScope },
): Promise<{ version: number }> {
  const { session, account_id, patch } = input;
  requirePermission(session, 'pm.account.manage');

  const [current] = await pmDb()
    .select()
    .from(account)
    .where(and(eq(account.id, account_id), tenantScoped(account.tenant_id, session)))
    .limit(1);
  if (!current) throw new PmError('NOT_FOUND', 'account not found');

  if (input.expected_version !== undefined && input.expected_version !== current.version) {
    throw new PmError('CONFLICT', 'version mismatch');
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
      // Guards the read→update window: 0 rows means a concurrent write committed between our SELECT and this UPDATE.
      const updated = await tx
        .update(account)
        .set(set)
        .where(and(eq(account.id, account_id), eq(account.version, current.version)))
        .returning({ id: account.id, name: account.name, am_worker_id: account.am_worker_id });
      if (updated.length === 0) {
        throw new PmError('CONFLICT', 'account was modified concurrently');
      }
      const updatedRow = updated[0];
      if (!updatedRow) throw new PmError('CONFLICT', 'account was modified concurrently');
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.account',
        aggregateId: account_id,
        eventType: PM_ACCOUNT_UPDATED,
        eventVersion: 1,
        payload: {
          account_id,
          tenant_id: session.tenant_id,
          name: updatedRow.name,
          am_worker_id: updatedRow.am_worker_id ?? null,
          fields: changes.map(([f]) => f),
        },
      });
    },
  );
  return { version: nextVersion };
}
