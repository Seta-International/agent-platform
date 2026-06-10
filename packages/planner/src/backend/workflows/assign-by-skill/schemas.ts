import { z } from 'zod';

export const AssignBySkillInputSchema = z.object({
  taskId: z.string().uuid(),
});
export type AssignBySkillInput = z.infer<typeof AssignBySkillInputSchema>;

export const CandidateUserSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  skills: z.array(z.string()),
  exactOverlap: z.number().int().min(0),
  vectorScore: z.number().nullable(),
  historyScore: z.number().nullable(),
  historyMatches: z.number().int().min(0),
  openTaskCount: z.number().int().min(0).nullable(),
  hoursAvailableThisWeek: z.number().nullable(),
  timezone: z.string().nullable(),
  finalScore: z.number().min(0).max(1),
});
export type CandidateUser = z.infer<typeof CandidateUserSchema>;

/**
 * Output of one `assignBySkill` run.
 *
 * - `assigned` — user picked the top suggestion (or modified it via alternates)
 * - `left-unassigned` — user clicked "Leave unassigned" / no candidates found
 * - `declined` — user dismissed the approval card outright
 *
 * Both `left-unassigned` and `declined` are valid terminal states; the
 * distinction matters for telemetry (active opt-out vs. dismissal).
 */
export const AssignBySkillOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('assigned'),
    taskId: z.string(),
    userIds: z.array(z.string()).min(1),
  }),
  z.object({ kind: z.literal('left-unassigned'), taskId: z.string() }),
  z.object({ kind: z.literal('declined') }),
  // INV-1: task already has assignees from another path (workflow inbox,
  // another chat session) between the suspend and the resume; don't double-write.
  z.object({
    kind: z.literal('superseded'),
    taskId: z.string(),
    currentAssigneeIds: z.array(z.string()),
  }),
  // Chat-flow HITL: the tool wrote an approval card to the DB and returned
  // immediately (no Mastra suspension). The agent should tell the user to
  // review the card above.
  z.object({
    kind: z.literal('pending-approval'),
    taskId: z.string(),
    approvalId: z.string().uuid(),
  }),
]);
export type AssignBySkillOutput = z.infer<typeof AssignBySkillOutputSchema>;

/**
 * Resume payload posted back via the agent stream after the user interacts
 * with the suggestAssignee approval card.
 */
export const AssignDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('assign'),
    assigneeUserIds: z.array(z.string().uuid()).min(1),
  }),
  z.object({ action: z.literal('leave-unassigned') }),
  z.object({ action: z.literal('decline') }),
]);
export type AssignDecision = z.infer<typeof AssignDecisionSchema>;
