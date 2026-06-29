import type { NodeTx } from '@seta/shared-db';
import { and, eq, gte, isNull, lte, ne, or, type SQL } from 'drizzle-orm';
import { allocation } from '../db/schema.ts';
import { PmError } from '../rbac.ts';

/**
 * A worker may hold only one allocation per project at any point in time.
 * Throws CONFLICT (→ 409) when {worker, project} already has a non-deleted
 * allocation whose date range overlaps the candidate. NULL endpoints are
 * open-ended (±∞) and never bound the comparison.
 */
export async function assertNoProjectOverlap(
  tx: NodeTx,
  args: {
    tenant_id: string;
    worker_id: string;
    project_id: string;
    date_from: string | null;
    date_to: string | null;
    excludeId?: string;
  },
): Promise<void> {
  const conds: (SQL | undefined)[] = [
    eq(allocation.tenant_id, args.tenant_id),
    eq(allocation.worker_id, args.worker_id),
    eq(allocation.project_id, args.project_id),
    isNull(allocation.deleted_at),
  ];
  if (args.excludeId) conds.push(ne(allocation.id, args.excludeId));
  // overlap: existing.date_from <= candidate.date_to AND existing.date_to >= candidate.date_from
  if (args.date_to !== null) {
    conds.push(or(isNull(allocation.date_from), lte(allocation.date_from, args.date_to)));
  }
  if (args.date_from !== null) {
    conds.push(or(isNull(allocation.date_to), gte(allocation.date_to, args.date_from)));
  }

  const [conflict] = await tx
    .select({ id: allocation.id })
    .from(allocation)
    .where(and(...conds))
    .limit(1);
  if (conflict) {
    throw new PmError(
      'CONFLICT',
      'worker is already allocated to this project for an overlapping period',
    );
  }
}
