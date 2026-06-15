import { emit, withEmit } from '@seta/core/events';
import { and, eq, inArray } from 'drizzle-orm';
import {
  EVALUATION_RUN_COMPLETED,
  EVALUATION_RUN_COMPLETED_VERSION,
  EVALUATION_RUN_FAILED,
  EVALUATION_RUN_FAILED_VERSION,
} from '../../events.ts';
import { evaluationDb } from '../db/client.ts';
import { caseResults, cases, runs, scores } from '../db/schema.ts';
import { rawCall as defaultRawCall } from '../scoring/raw-call.ts';
import { resolveModel } from '../scoring/resolve-model.ts';
import { scoreCase } from '../scoring/score-case.ts';

export interface RunEvaluationPayload {
  runId: string;
  tenantId: string;
}

export interface RunEvaluationDeps {
  /** Test seam — defaults to the real Agent.generate raw call. */
  rawCallFn?: typeof defaultRawCall;
}

interface Summary {
  cases: { total: number; ok: number; error: number };
  scorers: Record<string, { avg: number; n: number }>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runEvaluation(
  payload: RunEvaluationPayload,
  deps: RunEvaluationDeps = {},
): Promise<void> {
  const rawCall = deps.rawCallFn ?? defaultRawCall;
  const db = evaluationDb('worker');

  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, payload.runId), eq(runs.tenant_id, payload.tenantId)))
    .limit(1);
  if (!run) return;
  // Terminal-state guard: a graphile retry (or a re-enqueue) of an already
  // finished run must not re-process or re-emit. Idempotency of case_results is
  // also covered by the (run_id, case_id) skip below, but returning here avoids
  // the redundant work and a duplicate completed/failed event.
  if (run.status === 'completed' || run.status === 'failed') return;

  await db
    .update(runs)
    .set({ status: 'running', started_at: new Date() })
    .where(eq(runs.id, run.id));

  try {
    const caseRows = await db.select().from(cases).where(eq(cases.dataset_id, run.dataset_id));
    const scorerIds = run.scorer_ids as string[];
    const targetModel = resolveModel(run.target_model);
    const judgeModel = run.judge_model ? resolveModel(run.judge_model) : undefined;

    for (const c of caseRows) {
      const [existing] = await db
        .select({ id: caseResults.id })
        .from(caseResults)
        .where(and(eq(caseResults.run_id, run.id), eq(caseResults.case_id, c.id)))
        .limit(1);
      if (existing) continue;

      try {
        const { output, latencyMs } = await rawCall(targetModel, c.input);
        const [cr] = await db
          .insert(caseResults)
          .values({
            tenant_id: run.tenant_id,
            run_id: run.id,
            case_id: c.id,
            output,
            status: 'ok',
            latency_ms: latencyMs,
          })
          .returning({ id: caseResults.id });
        const scored = await scoreCase({
          scorerIds,
          input: c.input,
          output,
          groundTruth: c.ground_truth,
          judgeModel,
        });
        if (cr && scored.length) {
          await db.insert(scores).values(
            scored.map((s) => ({
              tenant_id: run.tenant_id,
              case_result_id: cr.id,
              scorer_id: s.scorerId,
              score: s.score,
              reason: s.reason ?? null,
            })),
          );
        }
      } catch (caseErr) {
        await db
          .insert(caseResults)
          .values({
            tenant_id: run.tenant_id,
            run_id: run.id,
            case_id: c.id,
            status: 'error',
            error: errMsg(caseErr),
          })
          .onConflictDoNothing();
      }
    }

    const summary = await computeSummary(db, run.id, scorerIds);
    // Bus-is-the-outbox: the terminal status change and its event commit in one
    // transaction (the run row is written through the core tx, same as createRun).
    await withEmit({ actor: { userId: 'system', tenantId: run.tenant_id } }, async (tx) => {
      await tx
        .update(runs)
        .set({ status: 'completed', finished_at: new Date(), summary })
        .where(eq(runs.id, run.id));
      await emit({
        tenantId: run.tenant_id,
        aggregateType: 'evaluation.run',
        aggregateId: run.id,
        eventType: EVALUATION_RUN_COMPLETED,
        eventVersion: EVALUATION_RUN_COMPLETED_VERSION,
        payload: {
          tenant_id: run.tenant_id,
          run_id: run.id,
          dataset_id: run.dataset_id,
          summary,
        },
      });
    });
  } catch (fatal) {
    await withEmit({ actor: { userId: 'system', tenantId: run.tenant_id } }, async (tx) => {
      await tx
        .update(runs)
        .set({ status: 'failed', finished_at: new Date(), error: errMsg(fatal) })
        .where(eq(runs.id, run.id));
      await emit({
        tenantId: run.tenant_id,
        aggregateType: 'evaluation.run',
        aggregateId: run.id,
        eventType: EVALUATION_RUN_FAILED,
        eventVersion: EVALUATION_RUN_FAILED_VERSION,
        payload: {
          tenant_id: run.tenant_id,
          run_id: run.id,
          dataset_id: run.dataset_id,
          error: errMsg(fatal),
        },
      });
    });
  }
}

async function computeSummary(
  db: ReturnType<typeof evaluationDb>,
  runId: string,
  scorerIds: string[],
): Promise<Summary> {
  const crRows = await db
    .select({ id: caseResults.id, status: caseResults.status })
    .from(caseResults)
    .where(eq(caseResults.run_id, runId));
  const total = crRows.length;
  const okRows = crRows.filter((r) => r.status === 'ok');
  const okIds = okRows.map((r) => r.id);
  const scoreRows = okIds.length
    ? await db.select().from(scores).where(inArray(scores.case_result_id, okIds))
    : [];
  const perScorer: Record<string, { avg: number; n: number }> = {};
  for (const id of scorerIds) {
    const vals = scoreRows.filter((s) => s.scorer_id === id).map((s) => s.score);
    perScorer[id] = vals.length
      ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length }
      : { avg: 0, n: 0 };
  }
  return { cases: { total, ok: okRows.length, error: total - okRows.length }, scorers: perScorer };
}
