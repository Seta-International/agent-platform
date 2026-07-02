import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { personProjection } from '../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { provisionLogin } from './provision-login.ts';

export async function provisionAccount(
  session: SessionScope,
  input: { person_id: string },
): Promise<{ user_id: string; created: boolean }> {
  await requirePermission(session.user_id, 'identity.user.update', session.tenant_id);

  const [row] = await identityDb()
    .select({ email: personProjection.work_email, name: personProjection.full_name })
    .from(personProjection)
    .where(
      and(
        eq(personProjection.person_id, input.person_id),
        eq(personProjection.tenant_id, session.tenant_id),
      ),
    )
    .limit(1);

  if (!row) throw new IdentityError('NOT_FOUND', 'person not in directory');
  if (!row.email) throw new IdentityError('VALIDATION', 'work_email required to provision');

  return provisionLogin(
    { tenant_id: session.tenant_id, email: row.email, name: row.name },
    { type: 'user', user_id: session.user_id },
  );
}
