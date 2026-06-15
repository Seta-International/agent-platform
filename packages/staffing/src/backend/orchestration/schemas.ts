import { z } from 'zod';

export const AvailabilityStatus = z.enum(['available', 'busy', 'ooo']);
export type AvailabilityStatus = z.infer<typeof AvailabilityStatus>;

/** One task returned by the analyzer's find_tasks (terminal) branch. */
export const TaskSummarySchema = z.object({
  taskId: z.string(),
  title: z.string(),
  status: z.enum(['not_started', 'in_progress', 'completed']),
  labels: z.array(z.string()),
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
  /** Candidate's own skills judged relevant to the required areas (literal or reasoned). */
  skillMatch: z.array(z.string()).optional(),
  skillMatchCount: z.number().int(),
  rank: z.number().int(),
});
export type RankedCandidate = z.infer<typeof RankedCandidateSchema>;

export const AvailabilityResultSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  status: AvailabilityStatus,
  inProgressCount: z.number().int(),
  availabilityScore: z.number().min(0).max(1),
});
export type AvailabilityResult = z.infer<typeof AvailabilityResultSchema>;

export const RecommendationSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  skillMatch: z.array(z.string()),
  skillMatchCount: z.number().int(),
  status: AvailabilityStatus,
  availabilityScore: z.number().min(0).max(1),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

// ---- per-agent input/output schemas ----
export const AnalyzerInputSchema = z.object({
  userText: z.string(),
  taskId: z.string().nullable(),
});
export const AnalyzerOutputSchema = SkillRequirementSchema;

// ---- taskAnalyzer (orchestrator-facing) ----
/**
 * What the orchestrator (the router) wants from the taskAnalyzer. The analyzer
 * does NOT guess this from the query — the orchestrator decides people-vs-task
 * and sets the intent, so the analyzer runs exactly one deterministic path.
 *   - resolve_task_skills : a specific task's required skills (needs taskId)
 *   - find_tasks          : list tasks whose labels match the query
 *   - extract_named_skills: the skills the user named in the query (→ skills)
 */
export const TaskAnalyzerIntent = z.enum([
  'resolve_task_skills',
  'find_tasks',
  'extract_named_skills',
]);
export type TaskAnalyzerIntent = z.infer<typeof TaskAnalyzerIntent>;

export const CompletionStatus = z.enum(['open', 'completed', 'any']);
export type CompletionStatus = z.infer<typeof CompletionStatus>;

export const TaskAnalyzerInputSchema = z.object({
  intent: TaskAnalyzerIntent,
  query: z.string(),
  taskId: z.string().nullable(),
  /** Only used for find_tasks. "open" = not completed, "completed" = done, "any" = all (default). */
  completionStatus: CompletionStatus.default('any'),
  /** Only used for find_tasks. Max tasks to return; falls back to the agent default when unset. */
  limit: z.number().int().min(1).max(50).optional(),
});
export const TaskAnalyzerOutputSchema = z.object({
  skills: z.array(z.string()).optional(),
  /** Task title on the resolve_task_skills path — used by the approval-card header. */
  title: z.string().optional(),
  tasks: z.array(TaskSummarySchema).optional(),
});
export type TaskAnalyzerOutput = z.infer<typeof TaskAnalyzerOutputSchema>;

// Across the recommend pipeline `taskId` is only a correlation label (search is
// by skills, availability is per-user). It is null for a task-less request
// ("recommend someone for aws and docker work") issued outside any task context.
// A plain people search ("find users with aws and docker") is terminal here:
// the matcher's candidates ARE the answer (OrchestratorResult.candidates).
export const SkillMatcherInputSchema = z.object({
  taskId: z.string().nullable(),
  skills: z.array(z.string()),
});
export const SkillMatcherOutputSchema = z.object({
  taskId: z.string().nullable(),
  candidates: z.array(RankedCandidateSchema),
});

export const AvaiCheckerInputSchema = z.object({
  taskId: z.string().nullable(),
  candidates: z.array(RankedCandidateSchema),
});
export const AvaiCheckerOutputSchema = z.object({
  taskId: z.string().nullable(),
  availability: z.array(AvailabilityResultSchema),
});

export const RecommenderInputSchema = z.object({
  taskId: z.string().nullable(),
  skills: z.array(z.string()),
  candidates: z.array(RankedCandidateSchema),
  availability: z.array(AvailabilityResultSchema),
});
export const RecommenderOutputSchema = z.object({
  taskId: z.string().nullable(),
  recommendations: z.array(RecommendationSchema),
});

// ---- orchestrator ----
export const OrchestratorInputSchema = z.object({
  userText: z.string(),
  taskId: z.string().nullable(),
});

export const OrchestratorTaskResultSchema = z.object({
  task: TaskSummarySchema,
  recommendations: z.array(RecommendationSchema).optional(),
});

export const UserProfileResultSchema = z.object({
  userId: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  skills: z.array(z.string()),
  availability: AvailabilityStatus,
});
export type UserProfileResult = z.infer<typeof UserProfileResultSchema>;

export const OrchestratorResultSchema = z.object({
  skills: z.array(z.string()).optional(),
  tasks: z.array(OrchestratorTaskResultSchema).optional(),
  /** Top skill matches — terminal answer for a people search (no recommendation asked). */
  candidates: z.array(RankedCandidateSchema).optional(),
  recommendations: z.array(RecommendationSchema).optional(),
  /** One or more profile hits — terminal answer for a named-person skills lookup. */
  userProfiles: z.array(UserProfileResultSchema).optional(),
  /** Set when a HITL approval card exists for this recommendation. `inThread`
   *  is false when the card lives in another thread (idempotent reuse of a
   *  pending proposal recorded for a different approver) — the final answer
   *  must not point at an in-thread card then. */
  pendingApproval: z
    .object({
      approvalId: z.string(),
      taskId: z.string(),
      inThread: z.boolean().default(true),
    })
    .optional(),
  message: z.string().optional(),
});
export type OrchestratorResult = z.infer<typeof OrchestratorResultSchema>;

// ---- generalAnswer (document / general Q&A fallback) ----
export const GeneralAnswerInputSchema = z.object({
  query: z.string(),
});
export const GeneralAnswerOutputSchema = z.object({
  answer: z.string(),
});
export type GeneralAnswerOutput = z.infer<typeof GeneralAnswerOutputSchema>;
