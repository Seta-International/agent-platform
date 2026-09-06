/** Client-side weight checks mirroring FUT-778 AC2/AC4 (cents to avoid float drift). */
export function weightCents(n: number): number {
  return Math.round(n * 100);
}

/**
 * What is wrong with one weight, in the editor's words — null when nothing is. Mirrors
 * `weightPct` in the people contract, so the field says what the server would reject.
 */
export function weightProblem(weight: number): string | null {
  if (!Number.isFinite(weight) || !Number.isInteger(weight)) return 'Whole numbers only.';
  if (weight <= 0) return 'Weight must be greater than 0%.';
  return null;
}

export function validateConfigDraft(
  groups: { weight: number; criteria: { weight: number }[] }[],
): string | null {
  let groupSum = 0;
  for (const g of groups) {
    groupSum += weightCents(g.weight);
    // The server requires at least one criterion per group (`criteria.min(1)`);
    // catch it here so Publish can't send a request that 400s with a raw error.
    if (g.criteria.length === 0) {
      return 'Every group needs at least one criterion.';
    }
    // Well-formed before it is balanced: a decimal or a zero makes the sums below
    // meaningless, and the server refuses the write outright.
    const gProblem = weightProblem(g.weight);
    if (gProblem) return `Group weights: ${gProblem}`;
    let critSum = 0;
    for (const c of g.criteria) {
      const cProblem = weightProblem(c.weight);
      if (cProblem) return `Criterion weights: ${cProblem}`;
      critSum += weightCents(c.weight);
    }
    if (critSum !== weightCents(g.weight)) {
      return 'Criteria weights in each group must equal that group’s weight.';
    }
  }
  if (groupSum !== 10_000) {
    return 'Group weights must total 100%.';
  }
  return null;
}
