import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { EVALUATION_RUN_CREATED, EVALUATION_RUN_CREATED_VERSION } from '../../events.ts';
import { evaluationDb } from '../db/client.ts';
import { datasets, runs } from '../db/schema.ts';
import { EvaluationError, requirePermission } from '../rbac.ts';
import { isKnownScorer, SCORER_REGISTRY } from '../scoring/prebuilt-registry.ts';
import { validateModelSpec } from '../scoring/resolve-model.ts';

export interface CreateRunInput {
  datasetId: string;
  targetModel: string;
  scorerIds: string[];
  judgeModel?: string;
  session: SessionScope;
}

export async function createRun(input: CreateRunInput): Promise<{ runId: string }> {
  requirePermission(input.session, 'evaluation.run.write');

  if (input.scorerIds.length === 0) {
    throw new EvaluationError('VALIDATION', 'At least one scorer is required');
  }
  for (const id of input.scorerIds) {
    if (!isKnownScorer(id)) {
      throw new EvaluationError('VALIDATION', `Unknown scorer: '${id}'`, { scorerId: id });
    }
  }
  const needsJudge = input.scorerIds.some((id) => SCORER_REGISTRY[id]?.kind === 'llm-judge');
  if (needsJudge && !input.judgeModel) {
    throw new EvaluationError(
      'VALIDATION',
      'judgeModel is required when an LLM-judge scorer is selected',
    );
  }
  validateModelSpec(input.targetModel);
  if (input.judgeModel) validateModelSpec(input.judgeModel);

  const db = evaluationDb();
  const [ds] = await db
    .select({ id: datasets.id })
    .from(datasets)
    .where(and(eq(datasets.id, input.datasetId), eq(datasets.tenant_id, input.session.tenant_id)))
    .limit(1);
  if (!ds) {
    throw new EvaluationError('NOT_FOUND', 'Dataset not found', { datasetId: input.datasetId });
  }

  let runId = '';
  await withEmit(
    { actor: { userId: input.session.user_id, tenantId: input.session.tenant_id } },
    async (tx) => {
      const [row] = await tx
        .insert(runs)
        .values({
          tenant_id: input.session.tenant_id,
          dataset_id: input.datasetId,
          status: 'pending',
          target_model: input.targetModel,
          scorer_ids: input.scorerIds,
          judge_model: input.judgeModel ?? null,
          created_by: input.session.user_id,
        })
        .returning({ id: runs.id });
      if (!row) throw new EvaluationError('VALIDATION', 'Insert returned no row');
      runId = row.id;
      await emit({
        tenantId: input.session.tenant_id,
        aggregateType: 'evaluation.run',
        aggregateId: runId,
        eventType: EVALUATION_RUN_CREATED,
        eventVersion: EVALUATION_RUN_CREATED_VERSION,
        payload: {
          tenant_id: input.session.tenant_id,
          run_id: runId,
          dataset_id: input.datasetId,
        },
      });
    },
  );
  return { runId };
}
