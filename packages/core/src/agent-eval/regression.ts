/** Pure regression detection over agent-eval scores. No DB — unit-tested directly. */

export interface ScoreKeyed {
  specialistId: string;
  scorerId: string;
  score: number;
}

export interface BaselineStat {
  /** Mean score over the baseline runs for this (specialist, scorer). */
  mean: number;
  /** Number of baseline runs that contributed (distinct run_id). */
  n: number;
}

export interface RegressionRow {
  specialistId: string;
  scorerId: string;
  current: number;
  baseline: number;
  drop: number;
}

export interface RegressionReport {
  regressions: RegressionRow[];
  insufficient: { specialistId: string; scorerId: string }[];
}

/** Stable Map key for a (specialist, scorer) pair. `␟` cannot appear in an id. */
export function scoreKey(specialistId: string, scorerId: string): string {
  return `${specialistId}␟${scorerId}`;
}

// Floating-point tolerance. Judge scores and `delta` are decimals, so
// `mean - delta` is not exactly representable (e.g. 0.8 - 0.1 = 0.7000000000000001).
// Treat a drop within EPSILON of the threshold as "at the boundary" — not a
// regression — so an exact-delta drop never spuriously flags.
const EPSILON = 1e-9;

export function detectRegressions(
  current: ScoreKeyed[],
  baselineMeans: Map<string, BaselineStat>,
  opts: { delta: number; minBaselineRuns: number },
): RegressionReport {
  const regressions: RegressionRow[] = [];
  const insufficient: { specialistId: string; scorerId: string }[] = [];
  for (const c of current) {
    const stat = baselineMeans.get(scoreKey(c.specialistId, c.scorerId));
    if (!stat || stat.n < opts.minBaselineRuns) {
      insufficient.push({ specialistId: c.specialistId, scorerId: c.scorerId });
      continue;
    }
    if (stat.mean - c.score - opts.delta > EPSILON) {
      regressions.push({
        specialistId: c.specialistId,
        scorerId: c.scorerId,
        current: c.score,
        baseline: stat.mean,
        drop: stat.mean - c.score,
      });
    }
  }
  return { regressions, insufficient };
}
