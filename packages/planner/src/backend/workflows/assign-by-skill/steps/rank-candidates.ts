import type { CandidateUser } from '../schemas.ts';
import type { EnrichedCandidate } from './enrich-with-load-capacity.ts';

const LOAD_TARGET = 5;
const FAR_DUE_DAYS = 30;
const HIGH_PRIORITY_THRESHOLD = 3;

export interface RankWeights {
  exact: number;
  vec: number;
  load: number;
  tz: number;
}

function normExact(n: number): number {
  return Math.min(1, n / 3);
}

function normLoad(open: number | null): number {
  if (open === null) return 0.5;
  return Math.max(0, 1 - open / LOAD_TARGET);
}

function normTz(userTz: string | null, tenantTz: string): number {
  if (!userTz) return 0.5;
  return userTz === tenantTz ? 1 : 0.5;
}

/**
 * Combine direct skill-match (vectorScore) and historical-task-match
 * (historyScore) into one "evidence" component. Both indicate fuzzy
 * suitability — we take the stronger signal rather than adding them to avoid
 * double-counting overlapping users.
 */
function vecEvidence(c: EnrichedCandidate): number {
  return Math.max(c.vectorScore ?? 0, c.historyScore ?? 0);
}

/**
 * Urgency multiplier on the TZ weight: a task due in 2 days from a writer in
 * the opposite TZ is much worse than the same task due in 6 months. Returns
 * 1 at the deadline, decays linearly to ~0.2 past `FAR_DUE_DAYS`. Past-due
 * tasks treated as maximum urgency.
 */
function urgencyMultiplier(dueAt: Date | null): number {
  if (!dueAt) return 1; // no deadline → neutral
  const days = (dueAt.getTime() - Date.now()) / 86_400_000;
  if (days <= 0) return 1;
  if (days >= FAR_DUE_DAYS) return 0.2;
  return 1 - (days / FAR_DUE_DAYS) * 0.8;
}

/**
 * High-priority tasks (priority_number 1 = urgent, 3 = high) lean harder on
 * exact match — you want a known expert, not a fuzzy candidate.
 */
function priorityBoost(priority: number): { exact: number; vec: number } {
  return priority <= HIGH_PRIORITY_THRESHOLD ? { exact: 1.2, vec: 0.9 } : { exact: 1, vec: 1 };
}

export function rankCandidates(input: {
  candidates: EnrichedCandidate[];
  weights: RankWeights;
  task: { dueAt: Date | null; tenantTz: string; priority: number };
  topK?: number;
}): CandidateUser[] {
  const w = input.weights;
  const pri = priorityBoost(input.task.priority);
  const tzMult = urgencyMultiplier(input.task.dueAt);

  const scored = input.candidates.map((c) => {
    const exact = normExact(c.exactOverlap);
    const vec = vecEvidence(c);
    const load = normLoad(c.openTaskCount);
    const tz = normTz(c.timezone, input.task.tenantTz);

    const weighted =
      w.exact * pri.exact * exact + w.vec * pri.vec * vec + w.load * load + w.tz * tzMult * tz;

    const normalizer = w.exact * pri.exact + w.vec * pri.vec + w.load + w.tz * tzMult;
    const finalScore = normalizer > 0 ? Math.min(1, weighted / normalizer) : 0;

    return { ...c, finalScore } satisfies CandidateUser;
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);
  return scored.slice(0, input.topK ?? 5);
}
