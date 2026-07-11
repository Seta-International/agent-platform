import { runRequestTenant } from '@seta/shared-db';
import { and, eq, isNull } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, userProjection } from '../db/schema.ts';

// Called during session-scope resolution, BEFORE the request's tenant GUC is bound
// (apps/server wires resolveWorkerId ahead of its runRequestTenant middleware), so it
// must pin its own tenant-bound connection — forced RLS on people.* hides every row
// from the NOBYPASSRLS web role otherwise. Returns the person id: that is what
// session.worker_id and every *_worker_id column hold.
export function getWorkerIdForUser(userId: string, tenantId: string): Promise<string | null> {
  return runRequestTenant(tenantId, async () => {
    const [row] = await peopleDb()
      .select({ worker_id: person.id })
      .from(person)
      .innerJoin(userProjection, eq(userProjection.person_id, person.id))
      .where(
        and(
          eq(userProjection.user_id, userId),
          eq(person.tenant_id, tenantId),
          isNull(person.deleted_at),
        ),
      )
      .limit(1);
    return row?.worker_id ?? null;
  });
}
