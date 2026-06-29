import type { SessionScope } from '@seta/core';
import { and, eq, isNull } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { allocation } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { requirePermission } from '../rbac.ts';

export interface AllocationRow {
  allocation_id: string;
  worker_id: string | null;
  role: string | null;
  planned_pct: number | null;
  bucket: 'billable' | 'internal' | 'bench';
  status: 'placeholder' | 'tentative' | 'committed';
}

export async function listProjectAllocations(input: {
  project_id: string;
  session: SessionScope;
}): Promise<AllocationRow[]> {
  const { project_id, session } = input;
  requirePermission(session, 'pm.project.read');
  const rows = await pmDb()
    .select({
      allocation_id: allocation.id,
      worker_id: allocation.worker_id,
      role: allocation.role,
      planned_pct: allocation.planned_pct,
      bucket: allocation.bucket,
      status: allocation.status,
    })
    .from(allocation)
    .where(
      and(
        eq(allocation.project_id, project_id),
        tenantScoped(allocation.tenant_id, session),
        isNull(allocation.deleted_at),
      ),
    );
  return rows.map((r) => ({
    allocation_id: r.allocation_id,
    worker_id: r.worker_id,
    role: r.role,
    planned_pct: r.planned_pct === null ? null : Number(r.planned_pct),
    bucket: r.bucket as AllocationRow['bucket'],
    status: r.status as AllocationRow['status'],
  }));
}
