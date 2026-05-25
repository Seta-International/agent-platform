import type { ApprovalCard, CandidateRow } from '@seta/copilot-sdk';
import type { Candidate, Classification, TaskDraft } from '../schemas.ts';

export interface ConfirmNotDuplicateInput {
  classification: Extract<Classification, 'likely-dup' | 'maybe-dup'>;
  candidates: Candidate[];
  draft: TaskDraft;
  session: { tenantId: string; userId: string };
  toolCallId: string;
}

const shortId = (id: string): string => id.slice(0, 8);

export function buildConfirmNotDuplicateCard(input: ConfirmNotDuplicateInput): ApprovalCard {
  const headline =
    input.classification === 'likely-dup'
      ? 'This may duplicate an existing task'
      : 'This might duplicate an existing task';

  const items: CandidateRow[] = input.candidates.map((c) => ({
    id: c.taskId,
    label: `#${shortId(c.taskId)} — ${c.title}`,
    score: c.score,
  }));

  // Per-candidate alternates: Related (creates new task + reference) or
  // Sub-task (appends checklist item to existing; no new task).
  const alternates: ApprovalCard['alternates'] = [];
  for (const c of input.candidates) {
    alternates.push(
      {
        label: `Related to #${shortId(c.taskId)}`,
        argsPatch: { action: 'link', existingId: c.taskId, mode: 'related' },
      },
      {
        label: `Sub-task of #${shortId(c.taskId)}`,
        argsPatch: { action: 'link', existingId: c.taskId, mode: 'sub-task' },
      },
    );
  }

  return {
    toolCallId: input.toolCallId,
    intent: `Create task: "${input.draft.title}"`,
    riskBadge: 'write',
    summary: headline,
    details: [{ kind: 'candidateList', items }],
    primary: { label: 'Create new anyway', argsPatch: { action: 'create-new' } },
    alternates,
    decline: { label: 'Cancel' },
    meta: {
      tenantId: input.session.tenantId,
      userId: input.session.userId,
      agentPath: ['supervisor', 'work', 'planner'],
      toolId: 'planner_createTask',
      ts: new Date().toISOString(),
    },
  };
}
