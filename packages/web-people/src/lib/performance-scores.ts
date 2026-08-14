/**
 * The 1–5 band model the Performance dashboards paint with. Presentation only —
 * every number it is given comes from the roll-up API, which does all the scoring
 * and weighting server-side.
 */

/** One heat-map column. Structural, so both the roll-up and config APIs satisfy it. */
export type GroupAxis = { group_id: string; name: string; weight: number };

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

/** Progress as a whole percent, guarding the "nothing expected yet" case. */
export function progressPct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Scores are rendered to a fixed precision or an em dash — never as 0. */
export function formatScore(value: number | null | undefined, digits = 2): string {
  return value == null ? '—' : value.toFixed(digits);
}
