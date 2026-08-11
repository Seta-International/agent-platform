// The pure colour semantics (value + bands → RAG) live in ../../contracts.ts (FUT-595): the
// web preview imports the very same functions via @seta/pm/contracts, so client preview and
// server-settled colour can never disagree. This module re-exports them for the backend and
// keeps the backend-only OHS scoring.
export {
  type BandCondition,
  bandMiss,
  computeCategoryHealth,
  computeEntryStatus,
  computeMetricValue,
  computeOverallHealth,
  computeScoredValue,
  evaluateBand,
  kpiValuePrecision,
  pickWorstMetric,
  type RagStatus,
  type RankableMetric,
  worstStatus,
} from '../../contracts.ts';

import type { RagStatus } from '../../contracts.ts';

export const OHS_POINTS: Record<RagStatus, number> = { green: 100, yellow: 70, red: 0 };

export const OHS_WEIGHTS = {
  quality: 0.25,
  cost_capacity: 0.35,
  delivery: 0.25,
  process: 0.15,
} as const;

export type OhsCategory = keyof typeof OHS_WEIGHTS;

export function computePillarScore(coreStatuses: readonly RagStatus[]): number {
  if (coreStatuses.length === 0) return 0;
  const sum = coreStatuses.reduce((acc, s) => acc + OHS_POINTS[s], 0);
  return sum / coreStatuses.length;
}

export function computeOhs(pillarScores: Record<OhsCategory, number>): number {
  return (
    pillarScores.quality * OHS_WEIGHTS.quality +
    pillarScores.cost_capacity * OHS_WEIGHTS.cost_capacity +
    pillarScores.delivery * OHS_WEIGHTS.delivery +
    pillarScores.process * OHS_WEIGHTS.process
  );
}

export function ohsRag(ohs: number): RagStatus {
  if (ohs >= 90) return 'green';
  if (ohs >= 70) return 'yellow';
  return 'red';
}
