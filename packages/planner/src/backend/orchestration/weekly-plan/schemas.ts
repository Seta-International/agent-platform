// packages/planner/src/backend/orchestration/weekly-plan/schemas.ts
import { z } from 'zod';

// ─── Calendar ────────────────────────────────────────────────────────────────

export const WeekdaySchema = z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
export type Weekday = z.infer<typeof WeekdaySchema>;

/** Monday-first ordering used everywhere a weekday index is needed. */
export const WEEKDAY_ORDER: readonly Weekday[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
];

/** The plannable slice of a week. Current week: startDay = the day the user asks
 *  (weekend asks roll to the upcoming Monday). Next week: always 'Monday'. */
export const PlanWindowSchema = z.object({
  startDay: WeekdaySchema,
  endDay: z.literal('Friday'),
  weekStart: z.string().describe('ISO date (YYYY-MM-DD) of startDay.'),
  weekEnd: z.string().describe('ISO date (YYYY-MM-DD) of the Friday ending the window.'),
});
export type PlanWindow = z.infer<typeof PlanWindowSchema>;

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const NormalizedTaskSchema = z.object({
  taskId: z
    .string()
    .optional()
    .describe('Planner task UUID when sourced from planner_queryTasks; absent for pasted tasks.'),
  title: z.string().min(1),
  priority: z.enum(['urgent', 'important', 'medium', 'low']),
  priorityAssumed: z
    .boolean()
    .describe('true when the source stated no priority and "medium" was assumed.'),
  dueAt: z.string().nullable().describe('ISO date, or null when the source gave none.'),
  dueAssumed: z.boolean().describe('true when the source stated no due date.'),
  overdue: z.boolean().describe('true when dueAt is before the window start.'),
  notes: z.string().optional(),
});
export type NormalizedTask = z.infer<typeof NormalizedTaskSchema>;

// ─── Plan output ─────────────────────────────────────────────────────────────

export const FocusBlockSchema = z.object({
  label: z
    .string()
    .min(1)
    .describe('Short focus-block label, e.g. "Interviews" or "Deep work: KPI module".'),
  taskTitles: z.array(z.string().min(1)).min(1),
});
export type FocusBlock = z.infer<typeof FocusBlockSchema>;

export const WeeklyPlanSchema = z.object({
  days: z.array(z.object({ day: WeekdaySchema, blocks: z.array(FocusBlockSchema) })),
  unplaced: z
    .array(z.string())
    .describe('Task titles that could not be placed. Must be empty in a valid plan.'),
});
export type WeeklyPlan = z.infer<typeof WeeklyPlanSchema>;

export const InsightSchema = z.object({
  kind: z.enum(['risk', 'workload', 'focus']),
  text: z.string().min(1),
});
export type Insight = z.infer<typeof InsightSchema>;

// ─── Sub-agent IO (used by Plans 02/03) ──────────────────────────────────────

export const CollectorInputSchema = z.object({
  userText: z.string().describe('The user planning request, verbatim.'),
  window: PlanWindowSchema,
});
export type CollectorInput = z.infer<typeof CollectorInputSchema>;

export const CollectorOutputSchema = z.object({ tasks: z.array(NormalizedTaskSchema) });
export type CollectorOutput = z.infer<typeof CollectorOutputSchema>;

export const BuilderInputSchema = z.object({
  tasks: z.array(NormalizedTaskSchema),
  window: PlanWindowSchema,
});
export type BuilderInput = z.infer<typeof BuilderInputSchema>;

export const BuilderOutputSchema = z.object({
  plan: WeeklyPlanSchema,
  caveat: z
    .string()
    .nullable()
    .describe(
      'Set when the LLM plan failed validation twice and the deterministic fallback was used.',
    ),
});
export type BuilderOutput = z.infer<typeof BuilderOutputSchema>;

export const InsightInputSchema = z.object({
  plan: WeeklyPlanSchema,
  tasks: z.array(NormalizedTaskSchema),
});
export type InsightInput = z.infer<typeof InsightInputSchema>;

export const InsightOutputSchema = z.object({ insights: z.array(InsightSchema) });
export type InsightOutput = z.infer<typeof InsightOutputSchema>;
