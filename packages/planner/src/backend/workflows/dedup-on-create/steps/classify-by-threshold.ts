import type { Candidate, Classification } from '../schemas.ts';

export interface Thresholds {
  likelyDup: number;
  maybeDup: number;
}

export interface ClassifyOutput {
  classification: Classification;
  top: Candidate[];
}

export function toDistance(score: number): number {
  return 1 - score;
}

export function classifyByThreshold(
  { candidates }: { candidates: Candidate[] },
  thresholds: Thresholds,
): ClassifyOutput {
  const top = candidates.slice(0, 5);
  if (top.length === 0) return { classification: 'no-match', top };
  const best = top[0];
  if (!best) return { classification: 'no-match', top };
  const bestDistance = toDistance(best.score);
  if (bestDistance < thresholds.likelyDup) return { classification: 'likely-dup', top };
  if (bestDistance < thresholds.maybeDup) return { classification: 'maybe-dup', top };
  return { classification: 'no-match', top };
}
