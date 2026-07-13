import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, userProjection } from '../db/schema.ts';
import { PeopleError } from '../rbac.ts';

// Self-service profile writes resolve the caller's own person via user_projection,
// the canonical user↔person link (same pattern setPresence uses). No id in the path.
export async function resolveSelfPersonId(session: SessionScope): Promise<string> {
  const [row] = await peopleDb()
    .select({ person_id: person.id })
    .from(person)
    .innerJoin(userProjection, eq(userProjection.person_id, person.id))
    .where(
      and(tenantScoped(person.tenant_id, session), eq(userProjection.user_id, session.user_id)),
    )
    .limit(1);
  if (!row) throw new PeopleError('NOT_FOUND', 'no person record linked to this user');
  return row.person_id;
}
