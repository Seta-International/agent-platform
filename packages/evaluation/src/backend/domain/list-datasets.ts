import type { SessionScope } from '@seta/core';
import { desc, eq } from 'drizzle-orm';
import { evaluationDb } from '../db/client.ts';
import { datasets } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';

export async function listDatasets(input: { session: SessionScope }) {
  requirePermission(input.session, 'evaluation.dataset.read');
  const db = evaluationDb();
  return db
    .select()
    .from(datasets)
    .where(eq(datasets.tenant_id, input.session.tenant_id))
    .orderBy(desc(datasets.created_at));
}
