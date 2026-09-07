import { and, eq } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { personProjection } from '../db/schema.ts';
import { PmError } from '../rbac.ts';

/**
 * FUT-953 (AC1): a worker whose people-side lifecycle_stage is 'alumni' cannot be named
 * on a NEW allocation. Callers must only guard inserts, never updates to a pre-existing
 * row — AC2 requires an alumni worker's existing allocations stay fully editable/endable.
 */
export async function assertWorkerNotAlumni(tenant_id: string, worker_id: string): Promise<void> {
  const [row] = await pmDb()
    .select({ is_alumni: personProjection.is_alumni })
    .from(personProjection)
    .where(
      and(eq(personProjection.person_id, worker_id), eq(personProjection.tenant_id, tenant_id)),
    )
    .limit(1);
  if (row?.is_alumni) {
    throw new PmError('VALIDATION', 'cannot allocate an alumni employee', { worker_id });
  }
}
