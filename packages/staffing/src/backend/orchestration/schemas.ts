import { z } from 'zod';

export const AvailabilityStatus = z.enum(['available', 'busy', 'ooo']);
export type AvailabilityStatus = z.infer<typeof AvailabilityStatus>;

/** One task returned by the analyzer's find_tasks (terminal) branch. */
export const TaskSummarySchema = z.object({
  taskId: z.string(),
  title: z.string(),
  status: z.enum(['not_started', 'in_progress', 'completed']),
  skillTags: z.array(z.string()),
});

/** analyzer output (also the self-gating signal: actionable=false => terminal). */
export const SkillRequirementSchema = z.object({
  actionable: z.boolean(),
  taskId: z.string().optional(),
  title: z.string().optional(),
  skills: z.array(z.string()).default([]),
  message: z.string().optional(), // set when !actionable
  // Present only on the find_tasks terminal result; match/recommend never read it,
  // so adding it does not affect the assignee-recommendation pipeline.
  tasks: z.array(TaskSummarySchema).optional(),
});
export type SkillRequirement = z.infer<typeof SkillRequirementSchema>;

export const RankedCandidateSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  skills: z.array(z.string()),
  role: z.string().nullable(),
  skillMatchCount: z.number().int(),
  rank: z.number().int(),
});
export type RankedCandidate = z.infer<typeof RankedCandidateSchema>;

export const AvailabilityResultSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  status: AvailabilityStatus,
  inProgressCount: z.number().int(),
});
export type AvailabilityResult = z.infer<typeof AvailabilityResultSchema>;

export const RecommendationSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  skillMatch: z.array(z.string()),
  skillMatchCount: z.number().int(),
  status: AvailabilityStatus,
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

// ---- per-agent input/output schemas ----
export const AnalyzerInputSchema = z.object({
  userText: z.string(),
  taskId: z.string().nullable(),
});
export const AnalyzerOutputSchema = SkillRequirementSchema;

export const SkillMatcherInputSchema = z.object({
  taskId: z.string(),
  skills: z.array(z.string()),
});
export const SkillMatcherOutputSchema = z.object({
  taskId: z.string(),
  candidates: z.array(RankedCandidateSchema),
});

export const AvaiCheckerInputSchema = z.object({
  taskId: z.string(),
  candidates: z.array(RankedCandidateSchema),
});
export const AvaiCheckerOutputSchema = z.object({
  taskId: z.string(),
  availability: z.array(AvailabilityResultSchema),
});

export const RecommenderInputSchema = z.object({
  taskId: z.string(),
  skills: z.array(z.string()),
  candidates: z.array(RankedCandidateSchema),
  availability: z.array(AvailabilityResultSchema),
});
export const RecommenderOutputSchema = z.object({
  taskId: z.string(),
  recommendations: z.array(RecommendationSchema),
});

export const STATUS_PRIORITY: Record<AvailabilityStatus, number> = {
  available: 2,
  busy: 1,
  ooo: 0,
};
export const OVERLOAD_THRESHOLD = 10;
