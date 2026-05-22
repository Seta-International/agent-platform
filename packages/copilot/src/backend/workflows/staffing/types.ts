import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────────
// Graphile-worker job names for the staffing workflow.
// Each name corresponds to one handler in the staffing task list.
// ──────────────────────────────────────────────────────────────────────────────

export const JOB_NAMES = {
  // Created by TaskAnalyzer (planner_buildTaskSkillQueue) — one job per task.
  SKILL_MATCHER_DISPATCH: 'staffing:skill_matcher_dispatch',
  // Created by SkillMatcher (skillMatcher_rankCandidates).
  AVAI_CHECKER_DISPATCH: 'staffing:avai_checker_dispatch',
  // Created by AvaiChecker (avaiChecker_buildAvailabilityQueue).
  RECOMMEND_DISPATCH: 'staffing:recommend_dispatch',
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// Shared sub-schemas
// ──────────────────────────────────────────────────────────────────────────────

const RankedCandidateSchema = z.object({
  user_id: z.string(),
  name: z.string().nullable(),
  skills: z.array(z.string()),
  role: z.string().nullable(),
  skill_match_count: z.number().int(),
  rank: z.number().int(),
});

const AvailabilityResultSchema = z.object({
  user_id: z.string(),
  name: z.string().nullable(),
  status: z.enum(['available', 'busy', 'ooo']),
  in_progress_tasks: z.array(
    z.object({
      task_id: z.string(),
      priority: z.enum(['urgent', 'important', 'medium', 'low']),
    }),
  ),
});

// ──────────────────────────────────────────────────────────────────────────────
// Job 1 — staffing:skill_matcher_dispatch
//
// Created by: makeTaskAnalyzerEnqueue (fan-out from batch — one job per task).
// Processed by: makeSkillMatcherDispatchHandler.
// ──────────────────────────────────────────────────────────────────────────────

export const SkillMatcherDispatchSchema = z.object({
  task_id: z.string().uuid(),
  title: z.string(),
  required_skills: z.array(z.string()).min(1),
  initiated_by: z.string(),
});

export type SkillMatcherDispatchPayload = z.infer<typeof SkillMatcherDispatchSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// Job 2 — staffing:avai_checker_dispatch
//
// Created by: makeSkillMatcherEnqueue.
// Carries required_skills forward (not in the tool's own enqueue params).
// Processed by: makeAvaiCheckerDispatchHandler.
// ──────────────────────────────────────────────────────────────────────────────

export const AvaiCheckerDispatchSchema = z.object({
  task_id: z.string().uuid(),
  required_skills: z.array(z.string()).min(1),
  skill_candidates: z.array(RankedCandidateSchema).min(1),
  initiated_by: z.string(),
});

export type AvaiCheckerDispatchPayload = z.infer<typeof AvaiCheckerDispatchSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// Job 3 — staffing:recommend_dispatch
//
// Created by: makeAvaiCheckerEnqueue.
// Carries required_skills + skill_candidates forward.
// Processed by: makeRecommendDispatchHandler — runs Recommender inline,
// no further queue hop.
// ──────────────────────────────────────────────────────────────────────────────

export const RecommendDispatchSchema = z.object({
  task_id: z.string().uuid(),
  required_skills: z.array(z.string()).min(1),
  skill_candidates: z.array(RankedCandidateSchema).min(1),
  availability_results: z.array(AvailabilityResultSchema).min(1),
  initiated_by: z.string(),
});

export type RecommendDispatchPayload = z.infer<typeof RecommendDispatchSchema>;
