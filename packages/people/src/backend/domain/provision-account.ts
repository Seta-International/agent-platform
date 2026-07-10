import type { SessionScope } from '@seta/core';
import { provisionLogin } from '@seta/identity';
import { and, eq, isNull } from 'drizzle-orm';
import type { PeoplePermission } from '../../rbac.ts';
import { peopleDb } from '../db/client.ts';
import { worker } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

export async function provisionAccount(
  session: SessionScope,
  input: { person_id: string },
): Promise<{ user_id: string; created: boolean }> {
  // identity.user.update is identity-owned but permission strings are checked
  // globally (session.permissions), so people can gate this identity-mutating
  // call on it; PeoplePermission just doesn't type it as "ours".
  requirePermission(session, 'identity.user.update' as PeoplePermission);

  const [row] = await peopleDb()
    .select({ email: worker.work_email, name: worker.full_name })
    .from(worker)
    .where(
      and(
        eq(worker.person_id, input.person_id),
        eq(worker.tenant_id, session.tenant_id),
        isNull(worker.deleted_at),
      ),
    )
    .limit(1);

  if (!row) throw new PeopleError('NOT_FOUND', 'person not in directory');
  if (!row.email) throw new PeopleError('VALIDATION', 'work_email required to provision');

  return provisionLogin(
    { tenant_id: session.tenant_id, email: row.email, name: row.name },
    { type: 'user', user_id: session.user_id },
  );
}
