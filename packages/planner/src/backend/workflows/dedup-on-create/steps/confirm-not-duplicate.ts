import type { ApprovalCard, CandidateRow } from '@seta/agent-sdk';
import type { Candidate, Classification, DedupInput } from '../schemas.ts';

export interface ConfirmNotDuplicateInput {
  classification: Extract<Classification, 'likely-dup' | 'maybe-dup'>;
  candidates: Candidate[];
  task: DedupInput;
  session: { tenantId: string; userId: string };
  toolCallId: string;
}

const shortId = (id: string): string => id.slice(0, 8);

/**
 * Builds the HITL ApprovalCard with exactly 3 options:
 * - Leave it (primary) — keep the task as-is
 * - Link ticket — mark as related to a duplicate candidate (one per candidate)
 * - Delete this ticket — remove the newly created task
 */
export function buildConfirmNotDuplicateCard(input: ConfirmNotDuplicateInput): ApprovalCard {
  const headline =
    input.classification === 'likely-dup'
      ? 'This task may duplicate an existing one'
      : 'This task might duplicate an existing one';

  const items: CandidateRow[] = input.candidates.map((c) => ({
    id: c.taskId,
    label: `#${shortId(c.taskId)} — ${c.title}`,
    score: c.score,
  }));

  // Per-candidate alternate: "Link to #XXXX" (mark as related)
  const alternates: ApprovalCard['alternates'] = [];
  for (const c of input.candidates) {
    alternates.push({
      label: `Link to #${shortId(c.taskId)}`,
      argsPatch: { kind: 'link', existingId: c.taskId },
    });
  }

  return {
    toolCallId: input.toolCallId,
    intent: `Duplicate check: "${input.task.title}"`,
    riskBadge: 'write',
    summary: headline,
    details: [{ kind: 'candidateList', items }],
    primary: { label: 'Leave it', argsPatch: { kind: 'leave' } },
    alternates,
    decline: { label: 'Delete this ticket', argsPatch: { kind: 'delete' } },
    meta: {
      tenantId: input.session.tenantId,
      userId: input.session.userId,
      agentPath: ['supervisor', 'work', 'planner'],
      toolId: 'planner_createTask',
      ts: new Date().toISOString(),
    },
  };
}
