import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { accessGroup, directoryPerson } from '../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { addGroupMembers } from './group-membership.ts';
import { provisionLogin } from './provision-login.ts';

export async function provisionAccount(
  session: SessionScope,
  input: { person_id: string },
): Promise<{ user_id: string; created: boolean }> {
  await requirePermission(session.user_id, 'identity.user.write', session.tenant_id);

  const [row] = await identityDb()
    .select({ email: directoryPerson.work_email, name: directoryPerson.full_name })
    .from(directoryPerson)
    .where(
      and(
        eq(directoryPerson.person_id, input.person_id),
        eq(directoryPerson.tenant_id, session.tenant_id),
      ),
    )
    .limit(1);

  if (!row) throw new IdentityError('NOT_FOUND', 'person not in directory');
  if (!row.email) throw new IdentityError('VALIDATION', 'work_email required to provision');

  const result = await provisionLogin(
    { tenant_id: session.tenant_id, email: row.email, name: row.name },
    { type: 'user', user_id: session.user_id },
  );

  const [base] = await identityDb()
    .select({ id: accessGroup.id })
    .from(accessGroup)
    .where(and(eq(accessGroup.tenant_id, session.tenant_id), eq(accessGroup.is_base, true)))
    .limit(1);
  if (base) {
    await addGroupMembers(
      { group_id: base.id, tenant_id: session.tenant_id, user_ids: [result.user_id] },
      { type: 'user', user_id: session.user_id },
    );
  }

  return result;
}
