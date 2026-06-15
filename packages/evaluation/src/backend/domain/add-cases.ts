import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import { evaluationDb } from '../db/client.ts';
import { cases, datasets } from '../db/schema.ts';
import { EvaluationError, requirePermission } from '../rbac.ts';

export interface AddCasesInput {
  datasetId: string;
  cases: Array<{ input: unknown; groundTruth?: string; metadata?: Record<string, unknown> }>;
  session: SessionScope;
}

export async function addCases(input: AddCasesInput): Promise<{ count: number }> {
  requirePermission(input.session, 'evaluation.dataset.write');
  if (input.cases.length === 0) {
    throw new EvaluationError('VALIDATION', 'No cases provided');
  }
  const db = evaluationDb();
  const [ds] = await db
    .select({ id: datasets.id })
    .from(datasets)
    .where(and(eq(datasets.id, input.datasetId), eq(datasets.tenant_id, input.session.tenant_id)))
    .limit(1);
  if (!ds) {
    throw new EvaluationError('NOT_FOUND', 'Dataset not found', { datasetId: input.datasetId });
  }
  const rows = input.cases.map((c) => ({
    tenant_id: input.session.tenant_id,
    dataset_id: input.datasetId,
    input: c.input,
    ground_truth: c.groundTruth ?? null,
    metadata: c.metadata ?? {},
  }));
  const inserted = await db.insert(cases).values(rows).returning({ id: cases.id });
  return { count: inserted.length };
}
