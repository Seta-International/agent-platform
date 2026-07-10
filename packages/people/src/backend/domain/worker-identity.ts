import { and, eq, isNull } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, worker } from '../db/schema.ts';

// Runs inside the caller's executor context: `sessionMiddleware` opens `scoped(tenantId)`
// before `getSessionScope` resolves the worker id, and `apps/cli` runs under `maintenance()`.
// It must not open its own — `pinTenantConnection` always acquires a fresh connection, so
// wrapping here would make every authenticated request hold two from a `max: 15` pool.
// Returns the person id: that is what session.worker_id and every *_worker_id column hold.
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
