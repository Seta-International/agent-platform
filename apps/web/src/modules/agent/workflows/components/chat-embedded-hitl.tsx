import { useAui } from '@assistant-ui/react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { buildDecisionFollowupMessage } from '../../lib/decision-followup-message.ts';
import type { WorkflowApprovalRow } from '../api/schemas.ts';
import { type DecideApprovalBody, workflowsApi } from '../api/workflows.ts';
import { useThreadPendingApprovals } from '../hooks/use-thread-pending-approvals.ts';
import { HitlApprovalCard } from './hitl-approval-card.tsx';

export interface ChatEmbeddedHitlProps {
  threadId: string | undefined;
}

const DECISION_LABELS: Record<string, string> = {
  approve: 'Approved',
  reject: 'Declined',
  modify: 'Modified',
};

function intentFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { intent?: unknown };
  return typeof p.intent === 'string' ? p.intent : null;
}

interface DecidedRowProps {
  decision: string;
  approval: WorkflowApprovalRow;
}

function DecidedRow({ decision, approval }: DecidedRowProps) {
  const label = DECISION_LABELS[decision] ?? decision;
  const intent = intentFromPayload(approval.proposedPayload);
  const isDecline = decision === 'reject';

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-surface-1 px-3.5 py-2.5">
      {isDecline ? (
        <XCircle className="mt-px size-4 shrink-0 text-ink-subtle" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-px size-4 shrink-0 text-semantic-success" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 text-body-sm">
          <span className="font-medium text-ink">{label}.</span>
          {intent ? <span className="truncate text-ink-subtle">{intent}</span> : null}
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-caption text-ink-subtle">
          Agent is responding
          <span className="inline-flex gap-0.5" aria-hidden>
            <span className="size-1 animate-bounce rounded-full bg-ink-subtle [animation-delay:0ms]" />
            <span className="size-1 animate-bounce rounded-full bg-ink-subtle [animation-delay:150ms]" />
            <span className="size-1 animate-bounce rounded-full bg-ink-subtle [animation-delay:300ms]" />
          </span>
        </p>
      </div>
    </div>
  );
}

export function ChatEmbeddedHitl({ threadId }: ChatEmbeddedHitlProps) {
  const approvalsQuery = useThreadPendingApprovals(threadId);
  const aui = useAui();

  const decide = useMutation({
    mutationFn: (args: { approvalId: string } & DecideApprovalBody) =>
      workflowsApi.decideApproval(args.approvalId, {
        decision: args.decision,
        overrideUserIds: args.overrideUserIds,
        note: args.note,
      }),
    onSuccess: (_res, variables) => {
      // The card stays visible (decided state rendered below).
      // Trigger a new agent turn — the LLM sees full thread history and generates
      // a contextual follow-up in the user's language. Works for any HITL flow.
      //
      // The action was already executed server-side by the ChatHitlDecider (a
      // domain call invisible to the conversation). We must therefore tell the
      // agent the action is COMPLETE, otherwise it re-runs it and surfaces a
      // second redundant approval card. See decision-followup-message.ts.
      const decided = approvalsQuery.data?.find((a) => a.approvalId === variables.approvalId);
      const text = decided
        ? buildDecisionFollowupMessage(variables.decision, decided)
        : (DECISION_LABELS[variables.decision] ?? variables.decision);
      aui.thread().append({ role: 'user', content: [{ type: 'text', text }] });
    },
  });

  const approvals = approvalsQuery.data;
  if (!approvals || approvals.length === 0) return null;

  const decidedApprovalId =
    decide.isSuccess && decide.variables ? decide.variables.approvalId : null;
  const decidedLabel = decide.variables
    ? (DECISION_LABELS[decide.variables.decision] ?? decide.variables.decision)
    : null;

  return (
    <section className="space-y-3" aria-label="In-thread approvals">
      {approvals.map((approval) => {
        // Replace only the card that was just decided with a compact confirmation row.
        if (approval.approvalId === decidedApprovalId && decidedLabel) {
          return (
            <DecidedRow
              key={approval.approvalId}
              decision={decide.variables?.decision ?? 'approve'}
              approval={approval}
            />
          );
        }
        return (
          <HitlApprovalCard
            key={approval.approvalId}
            approval={approval}
            canAct
            pending={decide.isPending && decide.variables?.approvalId === approval.approvalId}
            onDecide={(args) => decide.mutate({ approvalId: approval.approvalId, ...args })}
          />
        );
      })}
    </section>
  );
}
