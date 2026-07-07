import type { CandidateUser } from '../schemas.ts';
import type { EnrichedCandidate } from './enrich-with-load-capacity.ts';

const LOAD_TARGET = 5;
const FAR_DUE_DAYS = 30;
const HIGH_PRIORITY_THRESHOLD = 3;
/** Overlap count that saturates the exact signal, capping the label-count denominator. */
const EXACT_SATURATION = 3;
/**
 * Minimum fuzzy evidence (vector or history) required for a candidate with no
 * exact overlap to surface. Without this, a person who merely shares a weak
 * embedding neighbourhood — but has an empty queue — floats up on the load
 * signal alone and reads as a ~35% "match" despite zero skill signal.
 */
const EVIDENCE_FLOOR = 0.3;

export interface RankWeights {
  exact: number;
  vec: number;
  load: number;
  tz: number;
}

/**
 * Normalize exact overlap against the task's own label count (capped at
 * EXACT_SATURATION), not a fixed constant — otherwise a candidate who matches
 * *every* label of a 1- or 2-label task could never reach a full exact score.
 */
function normExact(n: number, labelCount: number): number {
  const denom = Math.min(Math.max(labelCount, 1), EXACT_SATURATION);
  return Math.min(1, n / denom);
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
 * A candidate qualifies for the skill-based suggestion list only with real
 * evidence: a literal skill overlap, or fuzzy (vector/history) evidence above
 * EVIDENCE_FLOOR. Load and timezone are tie-breakers among the qualified, never
 * a reason to surface someone on their own.
 */
function hasSkillEvidence(c: EnrichedCandidate): boolean {
  return c.exactOverlap > 0 || vecEvidence(c) >= EVIDENCE_FLOOR;
}

/**
 * Deterministic reference timezone for the TZ alignment signal: the most common
 * timezone across the candidate pool (lexical tie-break), falling back to UTC.
 * Pool-derived rather than caller-derived so the same task ranks identically no
 * matter who opens the suggestions.
 */
export function modalTimezone(candidates: ReadonlyArray<{ timezone: string | null }>): string {
  const counts = new Map<string, number>();
  for (const c of candidates) {
    if (!c.timezone) continue;
    counts.set(c.timezone, (counts.get(c.timezone) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [tz, n] of counts) {
    if (n > bestN || (n === bestN && best !== null && tz < best)) {
      best = tz;
      bestN = n;
    }
  }
  return best ?? 'UTC';
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

/**
 * Rank the shortlist deterministically from DB-derived signals only —
 * canonical exact-label overlap, person-profile vector similarity, task
 * history, load, and timezone. No LLM sits in the scoring path, so the inline
 * suggestions panel and the chat approval card rank a given task identically
 * on every call. `rationale` is left null; the web synthesizes a deterministic
 * explanation from these same signals.
 */
export function rankCandidates(input: {
  candidates: EnrichedCandidate[];
  weights: RankWeights;
  task: { dueAt: Date | null; referenceTz: string; priority: number; labelCount: number };
  topK?: number;
}): CandidateUser[] {
  const w = input.weights;
  const pri = priorityBoost(input.task.priority);
  const tzMult = urgencyMultiplier(input.task.dueAt);

  const scored = input.candidates.filter(hasSkillEvidence).map((c) => {
    const exact = normExact(c.exactOverlap, input.task.labelCount);
    const vec = vecEvidence(c);
    const load = normLoad(c.openTaskCount);
    const tz = normTz(c.timezone, input.task.referenceTz);

    const weighted =
      w.exact * pri.exact * exact + w.vec * pri.vec * vec + w.load * load + w.tz * tzMult * tz;

    const normalizer = w.exact * pri.exact + w.vec * pri.vec + w.load + w.tz * tzMult;
    const finalScore = normalizer > 0 ? Math.min(1, weighted / normalizer) : 0;

    return { ...c, finalScore, rationale: null } satisfies CandidateUser;
  });

  // Stable tie-break by userId so clustered scores never reshuffle between calls.
  scored.sort((a, b) => b.finalScore - a.finalScore || a.userId.localeCompare(b.userId));
  return scored.slice(0, input.topK ?? 5);
}
