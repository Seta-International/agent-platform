import type { ApprovalCard } from '@seta/agent-sdk';
import type { Recommendation } from './schemas.ts';

export interface BuildAssignApprovalCardOpts {
  taskId: string;
  /** Task title for the card header; falls back to the taskId when unknown. */
  title: string | null;
  /** Ranked recommendations from the recommender — must be non-empty. */
  recommendations: Recommendation[];
  tenantId: string;
  userId: string;
}

function candidateLabel(r: Recommendation): string {
  return r.name ?? r.userId;
}

/**
 * Maps a finished recommend flow onto the SDK ApprovalCard rendered by the
 * in-thread HitlApprovalCard component.
 *
 * meta.toolId is 'planner_proposeAssignment' ON PURPOSE: the decide-approval
 * endpoint routes by toolId, so this exact id reuses the existing planner
 * decider (executes assignTask), the one-proposal-per-task mutex, and the
 * supersede subscriber without touching any of them. argsPatch carries
 * {action, assigneeUserIds, taskId} — the shape that decider reads.
 */
export function buildAssignApprovalCard(opts: BuildAssignApprovalCardOpts): ApprovalCard {
  const { taskId, title, recommendations, tenantId, userId } = opts;
  const [top, ...rest] = recommendations;
  if (!top) throw new Error('buildAssignApprovalCard: recommendations must be non-empty');
  return {
    toolCallId: `staffing-orchestrator:${taskId}`,
    intent: `Assign "${title ?? taskId}"`,
    riskBadge: 'write',
    summary: `Top match: ${candidateLabel(top)} (${top.skillMatchCount} skill(s) matched, ${top.status}).`,
    details: [
      {
        kind: 'entityList',
        select: 'multi',
        items: recommendations.map((r, i) => ({
          id: r.userId,
          type: 'user',
          label: candidateLabel(r),
          secondary: `skills: ${r.skillMatch.join(', ') || '(none)'} · ${r.status}`,
          score: r.availabilityScore,
          primary: i === 0,
        })),
      },
      { kind: 'confidence', score: top.availabilityScore ?? 0.8 },
    ],
    primary: {
      label: `Assign to ${candidateLabel(top)}`,
      argsPatch: { action: 'assign', assigneeUserIds: [top.userId], taskId },
    },
    alternates: rest.map((r) => ({
      label: `Assign to ${candidateLabel(r)}`,
      argsPatch: { action: 'assign', assigneeUserIds: [r.userId], taskId },
    })),
    decline: { label: 'Leave unassigned' },
    meta: {
      tenantId,
      userId,
      agentPath: ['staffing', 'orchestrator'],
      toolId: 'planner_proposeAssignment',
      ts: new Date().toISOString(),
    },
  };
}
