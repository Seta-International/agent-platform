import type { SessionScope } from '@seta/core';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { evaluationDb } from '../db/client.ts';
import { caseResults, runs, scores } from '../db/schema.ts';
import { EvaluationError, requirePermission } from '../rbac.ts';

export interface ListRunResultsInput {
  runId: string;
  limit?: number;
  offset?: number;
  session: SessionScope;
}

export async function listRunResults(input: ListRunResultsInput) {
  requirePermission(input.session, 'evaluation.run.read');
  const db = evaluationDb();
  const [run] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.id, input.runId), eq(runs.tenant_id, input.session.tenant_id)))
    .limit(1);
  if (!run) throw new EvaluationError('NOT_FOUND', 'Run not found', { runId: input.runId });

  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const offset = Math.max(input.offset ?? 0, 0);
  const results = await db
    .select()
    .from(caseResults)
    .where(eq(caseResults.run_id, input.runId))
    .orderBy(asc(caseResults.created_at))
    .limit(limit)
    .offset(offset);

  const ids = results.map((r) => r.id);
  const scoreRows = ids.length
    ? await db.select().from(scores).where(inArray(scores.case_result_id, ids))
    : [];
  const byResult = new Map<string, typeof scoreRows>();
  for (const s of scoreRows) {
    const list = byResult.get(s.case_result_id) ?? [];
    list.push(s);
    byResult.set(s.case_result_id, list);
  }
  return results.map((r) => ({ ...r, scores: byResult.get(r.id) ?? [] }));
}
