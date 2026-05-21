export interface RankedItem {
  rank: number;
}

export interface RrfResult<T> {
  id: string;
  item: T;
  score: number;
  /** how many input lists contributed to the score (1..2 with two-list fusion) */
  sources: number;
}

/**
 * Reciprocal Rank Fusion. Pure function — no side effects, easy to test.
 *
 * Given two ranked lists of items, returns a single list ordered by
 * sum_i 1/(k + rank_i) where rank_i is the item's position in list i (absent → 0 contribution).
 *
 * k=60 is the standard IR default; tune only if you measure a win.
 */
export function rrfFuse<T extends RankedItem>(
  list1: T[],
  list2: T[],
  keyFn: (item: T) => string,
  opts: { k?: number } = {},
): RrfResult<T>[] {
  const k = opts.k ?? 60;
  const scores = new Map<string, { item: T; score: number; sources: number }>();

  for (const list of [list1, list2]) {
    for (const item of list) {
      const id = keyFn(item);
      const contribution = 1 / (k + item.rank);
      const existing = scores.get(id);
      if (existing) {
        existing.score += contribution;
        existing.sources += 1;
      } else {
        scores.set(id, { item, score: contribution, sources: 1 });
      }
    }
  }

  return Array.from(scores.entries())
    .map(([id, v]) => ({ id, item: v.item, score: v.score, sources: v.sources }))
    .sort((a, b) => b.score - a.score);
}
