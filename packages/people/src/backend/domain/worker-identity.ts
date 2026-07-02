import { and, eq, isNull } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, worker } from '../db/schema.ts';

export async function getWorkerIdForUser(userId: string, tenantId: string): Promise<string | null> {
  const [row] = await peopleDb()
    .select({ worker_id: worker.person_id })
    .from(worker)
    .innerJoin(person, eq(person.id, worker.person_id))
    .where(
      and(eq(person.user_id, userId), eq(worker.tenant_id, tenantId), isNull(worker.deleted_at)),
    )
    .limit(1);
  return row?.worker_id ?? null;
}
