import { and, desc, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema/index.ts';
import { coreAgentEvalRun, coreAgentEvalScore } from '../db/schema/index.ts';
import { type BaselineStat, type ScoreKeyed, scoreKey } from './regression.ts';

type Db = NodePgDatabase<typeof schema>;

export interface LatestScoreRow {
  specialistId: string;
  scorerId: string;
  layer: string;
  score: number;
  modelTier: string;
}

export interface LatestScores {
  rows: LatestScoreRow[];
  lastRunFinishedAt: Date | null;
}

export interface RegressionInputs {
  current: ScoreKeyed[];
  baselineMeans: Map<string, BaselineStat>;
}

/** The most recent completed run's scores, for the server gauges. */
export async function readLatestScores(db: Db): Promise<LatestScores> {
  const [latest] = await db
    .select({
      id: coreAgentEvalRun.id,
      finishedAt: coreAgentEvalRun.finished_at,
      modelTier: coreAgentEvalRun.model_tier,
    })
    .from(coreAgentEvalRun)
    .where(isNotNull(coreAgentEvalRun.finished_at))
    .orderBy(desc(coreAgentEvalRun.finished_at))
    .limit(1);
  if (!latest) return { rows: [], lastRunFinishedAt: null };
  const scores = await db
    .select({
      specialistId: coreAgentEvalScore.specialist_id,
      scorerId: coreAgentEvalScore.scorer_id,
      layer: coreAgentEvalScore.layer,
      score: coreAgentEvalScore.score,
    })
    .from(coreAgentEvalScore)
    .where(eq(coreAgentEvalScore.run_id, latest.id));
  return {
    rows: scores.map((s) => ({ ...s, modelTier: latest.modelTier })),
    lastRunFinishedAt: latest.finishedAt ?? null,
  };
}

/** Current run's scores + per-(specialist,scorer) mean over the previous `window` completed runs. */
export async function readRegressionInputs(
  db: Db,
  args: { currentRunId: string; window: number },
): Promise<RegressionInputs> {
  const current = await db
    .select({
      specialistId: coreAgentEvalScore.specialist_id,
      scorerId: coreAgentEvalScore.scorer_id,
      score: coreAgentEvalScore.score,
    })
    .from(coreAgentEvalScore)
    .where(eq(coreAgentEvalScore.run_id, args.currentRunId));

  const baselineMeans = new Map<string, BaselineStat>();
  const [cur] = await db
    .select({ startedAt: coreAgentEvalRun.started_at })
    .from(coreAgentEvalRun)
    .where(eq(coreAgentEvalRun.id, args.currentRunId));
  if (!cur) return { current, baselineMeans };

  const priorRuns = await db
    .select({ id: coreAgentEvalRun.id })
    .from(coreAgentEvalRun)
    .where(
      and(isNotNull(coreAgentEvalRun.finished_at), lt(coreAgentEvalRun.started_at, cur.startedAt)),
    )
    .orderBy(desc(coreAgentEvalRun.started_at))
    .limit(args.window);
  const priorIds = priorRuns.map((r) => r.id);
  if (priorIds.length === 0) return { current, baselineMeans };

  const rows = await db
    .select({
      specialistId: coreAgentEvalScore.specialist_id,
      scorerId: coreAgentEvalScore.scorer_id,
      score: coreAgentEvalScore.score,
      runId: coreAgentEvalScore.run_id,
    })
    .from(coreAgentEvalScore)
    .where(inArray(coreAgentEvalScore.run_id, priorIds));

  // Aggregate in JS (mean + distinct-run count) to avoid numeric-cast surprises
  // from SQL avg()/count (which return strings via node-postgres).
  const acc = new Map<string, { sum: number; runIds: Set<string> }>();
  for (const r of rows) {
    const k = scoreKey(r.specialistId, r.scorerId);
    const a = acc.get(k) ?? { sum: 0, runIds: new Set<string>() };
    a.sum += r.score;
    a.runIds.add(r.runId);
    acc.set(k, a);
  }
  for (const [k, a] of acc) {
    baselineMeans.set(k, { mean: a.sum / a.runIds.size, n: a.runIds.size });
  }
  return { current, baselineMeans };
}
