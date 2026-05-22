import type { RecommendedUser } from '../../../tools/recommender/merge-and-rank.ts';
import { RecommendDispatchSchema } from '../types.ts';

// ──────────────────────────────────────────────────────────────────────────────
// Handler: staffing:recommend_dispatch
//
// Final step of the staffing workflow.
// Receives the fully accumulated context: required_skills (from TaskAnalyzer),
// skill_candidates (from SkillMatcher), and availability_results (from AvaiChecker).
//
// Runs the Recommender logic inline — no agent invocation needed since this
// step is pure deterministic computation (no LLM required).
//
// Ranking:
//   1. skill_match_count DESC — skill overlap takes precedence
//   2. status priority DESC   — available(2) > busy(1) > on_leave(0)
//
// Delivers the final recommendation list via the injected onResult callback.
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = {
  available: 2,
  busy: 1,
  ooo: 0,
};

export type RecommendDispatchDeps = {
  /**
   * Called with the final ranked recommendations.
   * Caller decides the delivery mechanism: WebSocket push, SSE event,
   * Postgres row insert, HTTP response, etc.
   */
  onResult: (params: {
    task_id: string;
    initiated_by: string;
    recommendations: RecommendedUser[];
    total: number;
    completed_at: string;
  }) => Promise<void>;
};

export function makeRecommendDispatchHandler(deps: RecommendDispatchDeps) {
  return async (rawPayload: unknown, _helpers: unknown) => {
    const { task_id, required_skills, skill_candidates, availability_results, initiated_by } =
      RecommendDispatchSchema.parse(rawPayload);

    const requiredSet = new Set(required_skills.map((s) => s.toLowerCase()));

    // Build lookup maps for O(1) access.
    const skillMap = new Map(skill_candidates.map((c) => [c.user_id, c]));
    const avaiMap = new Map(availability_results.map((a) => [a.user_id, a]));

    // Union of all user_ids across both sources.
    const allUserIds = new Set([...skillMap.keys(), ...avaiMap.keys()]);

    const merged: RecommendedUser[] = [];

    for (const uid of allUserIds) {
      const skill = skillMap.get(uid);
      const avai = avaiMap.get(uid);

      const userSkills = skill?.skills ?? [];
      const skill_match = userSkills.filter((s) => requiredSet.has(s.toLowerCase()));
      const skill_match_count = skill?.skill_match_count ?? skill_match.length;

      merged.push({
        user_id: uid,
        user_name: avai?.name ?? skill?.name ?? null,
        skill_match,
        skill_match_count,
        in_progress_tasks: avai?.in_progress_tasks ?? [],
        status: avai?.status ?? 'busy',
      });
    }

    // Sort: skill_match_count DESC → availability status DESC.
    merged.sort((a, b) => {
      if (b.skill_match_count !== a.skill_match_count) {
        return b.skill_match_count - a.skill_match_count;
      }
      return (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0);
    });

    await deps.onResult({
      task_id,
      initiated_by,
      recommendations: merged,
      total: merged.length,
      completed_at: new Date().toISOString(),
    });
  };
}
