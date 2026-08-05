/** Client-side weight checks mirroring FUT-778 AC2/AC4 (cents to avoid float drift). */
export function weightCents(n: number): number {
  return Math.round(n * 100);
}

export function validateConfigDraft(
  groups: { weight: number; criteria: { weight: number }[] }[],
): string | null {
  let groupSum = 0;
  for (const g of groups) {
    groupSum += weightCents(g.weight);
    let critSum = 0;
    for (const c of g.criteria) critSum += weightCents(c.weight);
    if (critSum !== weightCents(g.weight)) {
      return 'Criteria weights in each group must equal that group’s weight.';
    }
  }
  if (groupSum !== 10_000) {
    return 'Group weights must total 100%.';
  }
  return null;
}
