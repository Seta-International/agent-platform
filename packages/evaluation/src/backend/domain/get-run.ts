import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import { evaluationDb } from '../db/client.ts';
import { runs } from '../db/schema.ts';
import { EvaluationError, requirePermission } from '../rbac.ts';

export async function getRun(input: { runId: string; session: SessionScope }) {
  requirePermission(input.session, 'evaluation.run.read');
  const db = evaluationDb();
  const [row] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, input.runId), eq(runs.tenant_id, input.session.tenant_id)))
    .limit(1);
  if (!row) throw new EvaluationError('NOT_FOUND', 'Run not found', { runId: input.runId });
  return row;
}
