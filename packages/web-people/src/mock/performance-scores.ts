/**
 * Shared scoring core for the Performance dashboards' mock data.
 *
 * Holds the pieces every capacity fixture (AM / TL / member) needs: the real
 * pillar axis type, the 1–5 band model, weighted roll-ups, and the deterministic
 * score generators. Keeping them here (not in one capacity's fixture) means no
 * fixture imports another, and the drop-in swap to a real scoring API touches
 * one module.
 */

/** One pillar/group column — sourced from the config API, not invented here. */
export type PerformanceGroupAxis = {
  group_id: string;
  name: string;
  /** Weight in whole percent; the account's groups sum to 100. */
  weight: number;
};

/** Score band on the 1–5 scale. Green ≥4.0, yellow 3.0–3.99, red <3.0. */
export type ScoreBand = 'strong' | 'meets' | 'below';

export function scoreBand(score: number): ScoreBand {
  if (score >= 4) return 'strong';
  if (score >= 3) return 'meets';
  return 'below';
}

export const SCORE_BAND_LEGEND: readonly { band: ScoreBand; label: string; range: string }[] = [
  { band: 'strong', label: 'Strong', range: '≥ 4.0' },
  { band: 'meets', label: 'Meets', range: '3.0 – 3.9' },
  { band: 'below', label: 'Below', range: '< 3.0' },
];

/** Weight-averaged score across the account's groups, rounded to one decimal. */
export function weightedOverall(
  groups: readonly PerformanceGroupAxis[],
  scores: Record<string, number>,
): number {
  const weight = groups.reduce((sum, g) => sum + g.weight, 0);
  if (weight === 0) return 0;
  const total = groups.reduce((sum, g) => sum + (scores[g.group_id] ?? 0) * g.weight, 0);
  return Math.round((total / weight) * 10) / 10;
}

/** Mean score per group across a set of scored subjects (project roll-up). */
export function meanScores(
  groups: readonly PerformanceGroupAxis[],
  subjects: readonly { scores: Record<string, number> }[],
): Record<string, number> {
  return Object.fromEntries(
    groups.map((g) => {
      const sum = subjects.reduce((acc, s) => acc + (s.scores[g.group_id] ?? 0), 0);
      const mean = subjects.length === 0 ? 0 : sum / subjects.length;
      return [g.group_id, Math.round(mean * 10) / 10];
    }),
  );
}

/** Stable string hash → [0, 1). Keeps mock scores deterministic per key. */
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // >>> 0 → unsigned; divide by 2^32 for a 0–1 fraction.
  return (h >>> 0) / 4294967296;
}

/**
 * Deterministic score in [floor, 4.9], one decimal. `bias` nudges a whole
 * subject's band so a matrix shows a range rather than a wash.
 */
export function seededScore(key: string, floor: number, bias: number): number {
  const raw = floor + hash01(key) * (4.9 - floor) + bias;
  return Math.round(Math.min(4.9, Math.max(1, raw)) * 10) / 10;
}

/** Per-group scores for one subject, keyed by the real group ids. */
export function scoresForSubject(
  groups: readonly PerformanceGroupAxis[],
  subjectId: string,
  floor: number,
  bias: number,
): Record<string, number> {
  return Object.fromEntries(
    groups.map((g) => [g.group_id, seededScore(`${subjectId}:${g.group_id}`, floor, bias)]),
  );
}
