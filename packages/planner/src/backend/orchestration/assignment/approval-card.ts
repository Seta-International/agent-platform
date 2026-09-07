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
  /** Minted once on the suspend pass and embedded in EVERY action's argsPatch, so
   *  whichever action the user picks — and whichever path resumes, /chat/resume or
   *  resumeRetry — the write is gated by the same key. */
  idempotencyKey: string;
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
  const { taskId, title, recommendations, tenantId, userId, idempotencyKey } = opts;
  const [top, ...rest] = recommendations;
  if (!top) throw new Error('buildAssignApprovalCard: recommendations must be non-empty');
  return {
    toolCallId: `assignment-orchestrator:${taskId}`,
    intent: `Assign "${title ?? taskId}"`,
    riskBadge: 'write',
    summary: `Top match: ${candidateLabel(top)} (${top.skillMatchCount} skill(s) matched, ${top.status}).`,
    details: [
      {
        kind: 'entityList',
        // Single-assignee semantics: radio, not checkbox. Picking another
        // candidate REPLACES the seeded top match (a checkbox would add a second
        // assignee), and it makes the decision dirty → 'modify' with the chosen
        // overrideUserId.
        select: 'single',
        items: recommendations.map((r, i) => ({
          id: r.userId,
          type: 'user',
          label: candidateLabel(r),
          secondary: `skills: ${r.skillMatch.join(', ') || '(none)'} · ${r.status}`,
          // Blended fit+availability (not raw availability, which saturates at
          // 100% for anyone free) so the per-candidate score is discriminating.
          score: r.score,
          primary: i === 0,
        })),
      },
      { kind: 'confidence', score: top.score ?? 0.8 },
    ],
    primary: {
      label: `Assign to ${candidateLabel(top)}`,
      argsPatch: { action: 'assign', assigneeUserIds: [top.userId], taskId, idempotencyKey },
    },
    alternates: rest.map((r) => ({
      label: `Assign to ${candidateLabel(r)}`,
      argsPatch: { action: 'assign', assigneeUserIds: [r.userId], taskId, idempotencyKey },
    })),
    decline: {
      label: 'Leave unassigned',
      // taskId rides here too: from FUT-806 onwards every branch of a card IS a
      // resume payload read verbatim, and a decline that cannot name its task
      // fails the strict resume schema.
      argsPatch: { action: 'decline', taskId, idempotencyKey },
    },
    meta: {
      tenantId,
      userId,
      agentPath: ['assignment', 'orchestrator'],
      toolId: 'planner_proposeAssignment',
      // Plural since FUT-840. The one-proposal-per-task mutex, declared rather
      // than inferred from the workflow id (design D7). An A2 assign card
      // declares the SAME string, so the two block and supersede each other
      // across two runtimes that neither know nor import one another.
      //
      // No `task:` key and no `supersedes`: the recommend flow is out of the
      // revision loop's scope (design D2).
      dedupKeys: [`assign:${taskId}`],
      ts: new Date().toISOString(),
    },
  };
}
