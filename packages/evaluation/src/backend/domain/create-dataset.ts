import type { SessionScope } from '@seta/core';
import { evaluationDb } from '../db/client.ts';
import { datasets } from '../db/schema.ts';
import { EvaluationError, requirePermission } from '../rbac.ts';

export interface CreateDatasetInput {
  name: string;
  description?: string;
  session: SessionScope;
}

export async function createDataset(input: CreateDatasetInput): Promise<{ datasetId: string }> {
  requirePermission(input.session, 'evaluation.dataset.write');
  const name = input.name.trim();
  if (name.length === 0) {
    throw new EvaluationError('VALIDATION', 'Dataset name cannot be empty');
  }
  const db = evaluationDb();
  const [row] = await db
    .insert(datasets)
    .values({
      tenant_id: input.session.tenant_id,
      name,
      description: input.description ?? null,
      created_by: input.session.user_id,
    })
    .returning({ id: datasets.id });
  if (!row) throw new EvaluationError('VALIDATION', 'Insert returned no row');
  return { datasetId: row.id };
}
