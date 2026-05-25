import type { ApprovalCard, CandidateRow } from '@seta/copilot-sdk';
import type { CandidateUser } from '../schemas.ts';

export interface SuggestAssigneeInput {
  taskId: string;
  taskTitle: string;
  candidates: CandidateUser[];
  session: { tenantId: string; userId: string };
  toolCallId: string;
}

function describeCandidate(c: CandidateUser): string {
  const parts: string[] = [];
  if (c.skills.length > 0) {
    parts.push(`skills: ${c.skills.slice(0, 4).join(', ')}`);
  }
  parts.push(`load: ${c.openTaskCount ?? '?'} tasks`);
  if (c.hoursAvailableThisWeek != null) parts.push(`free: ${c.hoursAvailableThisWeek}h`);
  if (c.historyMatches > 0) parts.push(`history: ${c.historyMatches} similar`);
  parts.push(`tz: ${c.timezone ?? '?'}`);
  return parts.join(' · ');
}

/**
 * Build the ApprovalCard for suggestAssignee.
 *
 * - primary    → assign to the top-ranked candidate
 * - alternates → each remaining candidate (user picks via tap)
 * - decline    → leave the task unassigned
 *
 * argsPatch keys (`assigneeUserId`) match the planner_assignTask write tool's
 * input schema so the resume path can call it directly with the user's choice.
 */
export function buildSuggestAssigneeCard(input: SuggestAssigneeInput): ApprovalCard {
  const items: CandidateRow[] = input.candidates.map((c) => ({
    id: c.userId,
    label: c.displayName,
    secondary: describeCandidate(c),
    score: c.finalScore,
  }));

  const [top, ...rest] = input.candidates;

  return {
    toolCallId: input.toolCallId,
    intent: `Assign task "${input.taskTitle}" to a teammate`,
    riskBadge: 'write',
    summary: top
      ? `Top suggestion: ${top.displayName} (score ${top.finalScore.toFixed(2)})`
      : 'No candidates found — leave unassigned for now?',
    details: [{ kind: 'candidateList', items }],
    primary: top
      ? { label: `Assign to ${top.displayName}`, argsPatch: { assigneeUserId: top.userId } }
      : { label: 'No candidates' },
    alternates: rest.map((c) => ({
      label: `Assign to ${c.displayName}`,
      argsPatch: { assigneeUserId: c.userId },
    })),
    decline: { label: 'Leave unassigned' },
    meta: {
      tenantId: input.session.tenantId,
      userId: input.session.userId,
      agentPath: ['supervisor', 'work', 'planner'],
      toolId: 'planner_suggestAssignee',
      ts: new Date().toISOString(),
    },
  };
}
