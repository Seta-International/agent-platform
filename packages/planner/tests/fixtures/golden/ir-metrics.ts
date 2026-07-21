// packages/planner/tests/fixtures/golden/ir-metrics.ts
//
// Retrieval IR scorer with FROZEN metric semantics (spec §E). Changing any
// definition here changes every retrieval score, so the rules are fixed:
//   - graded relevance 0..3; unlabeled returned id → grade 0.
//   - nDCG@k uses graded gains (2^grade - 1) / log2(rank + 1).
//   - MRR / Recall@k count an item "relevant" when grade >= 2.
//   - top1Strong = top grade === 3; top1Acceptable = top grade >= 2.
//   - duplicate returned ids: keep the first occurrence (drop later dupes).
//   - empty result → every metric is 0.

export interface RetrievalScore {
  mrr: number;
  top1Strong: boolean;
  top1Acceptable: boolean;
  recallAtK: Record<number, number>;
  ndcgAtK: Record<number, number>;
}

const RELEVANT_THRESHOLD = 2;

function dedupeKeepFirst(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Graded DCG gain for a grade at 0-based rank `i`. */
function gain(grade: number, i: number): number {
  return (2 ** grade - 1) / Math.log2(i + 2);
}

/** Scores a ranked list of returned task ids against a graded relevance map. */
export function scoreRetrieval(
  returnedIds: string[],
  relevance: Record<string, number>,
  ks: number[],
): RetrievalScore {
  const ranked = dedupeKeepFirst(returnedIds);
  const gradeOf = (id: string): number => relevance[id] ?? 0;

  const topGrade = ranked.length > 0 ? gradeOf(ranked[0]!) : 0;

  // MRR — reciprocal rank of the first relevant (grade >= 2) result.
  let mrr = 0;
  for (let i = 0; i < ranked.length; i++) {
    if (gradeOf(ranked[i]!) >= RELEVANT_THRESHOLD) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  const totalRelevant = Object.values(relevance).filter((g) => g >= RELEVANT_THRESHOLD).length;

  // Ideal grade ordering for IDCG.
  const idealGrades = Object.values(relevance).sort((a, b) => b - a);

  const recallAtK: Record<number, number> = {};
  const ndcgAtK: Record<number, number> = {};
  for (const k of ks) {
    const topK = ranked.slice(0, k);

    const retrievedRelevant = topK.filter((id) => gradeOf(id) >= RELEVANT_THRESHOLD).length;
    recallAtK[k] = totalRelevant === 0 ? 0 : retrievedRelevant / totalRelevant;

    const dcg = topK.reduce((acc, id, i) => acc + gain(gradeOf(id), i), 0);
    const idcg = idealGrades.slice(0, k).reduce((acc, g, i) => acc + gain(g, i), 0);
    ndcgAtK[k] = idcg === 0 ? 0 : dcg / idcg;
  }

  return {
    mrr,
    top1Strong: topGrade === 3,
    top1Acceptable: topGrade >= RELEVANT_THRESHOLD,
    recallAtK,
    ndcgAtK,
  };
}
