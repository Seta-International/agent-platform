import { type EntityRef, HitlCard } from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { WorkflowApprovalRow } from '../api/schemas.ts';
import { useSubmitDecision } from '../hooks/use-submit-decision.ts';
import { workflowsQueryKeys } from '../state/query-keys.ts';
import { cardToolId } from './decided-approval.ts';
import { CandidateAvatar } from './hitl-approval-card.tsx';

// Entity-type → presentation. Entity *type* rendering is pluggable so the
// generic HitlCard never learns what a "user" or "task" looks like.
type EntityRenderer = (e: EntityRef) => ReactNode;

const renderDefaultEntity: EntityRenderer = (e) => (
  <span className="text-body-sm text-ink">{e.label}</span>
);

const entityRenderers: Record<string, EntityRenderer> = {
  user: (e) => (
    <>
      <CandidateAvatar id={e.id} label={e.label} />
      <span className="truncate text-body-sm font-medium text-ink">{e.label}</span>
      {e.secondary ? (
        <span className="w-full text-caption leading-snug text-ink-subtle">{e.secondary}</span>
      ) : null}
    </>
  ),
  task: (e) => (
    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-body-sm text-ink">{e.label}</span>
  ),
};

export interface HitlCardHostProps {
  approval: WorkflowApprovalRow;
  canAct: boolean;
  threadId: string | undefined;
}

// HitlCard dereferences card.details/primary/decline directly, so a stale or
// malformed payload must be filtered out here rather than crash the thread.
function isRenderableCard(
  payload: unknown,
): payload is { details: unknown[]; primary: { label: string }; decline: { label: string } } {
  if (!payload || typeof payload !== 'object') return false;
  const c = payload as {
    details?: unknown;
    primary?: { label?: unknown };
    decline?: { label?: unknown };
  };
  return (
    Array.isArray(c.details) &&
    typeof c.primary?.label === 'string' &&
    typeof c.decline?.label === 'string'
  );
}

export function HitlCardHost({ approval, canAct, threadId }: HitlCardHostProps) {
  const qc = useQueryClient();
  const submit = useSubmitDecision();

  if (!isRenderableCard(approval.proposedPayload)) return null;

  return (
    <HitlCard
      // proposedPayload IS the SDK ApprovalCard the builder emitted.
      card={approval.proposedPayload as never}
      canAct={canAct}
      pending={submit.isPending}
      expiresAt={approval.expiresAt}
      renderEntity={(e) => (entityRenderers[e.type] ?? renderDefaultEntity)(e)}
      onDecide={(decision) =>
        submit.mutate(
          { approvalId: approval.approvalId, agentic: approval.agentic, ...decision },
          {
            onSuccess: () => {
              if (threadId) {
                void qc.invalidateQueries({
                  queryKey: workflowsQueryKeys.threadApprovals(threadId),
                });
              }
              void qc.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() });
              // The decider/resume already executed the underlying write; tool ids
              // are `<module>_<action>` and each web module roots its query keys at
              // ['<module>'], so this refreshes the touched views without coupling.
              const moduleNs = cardToolId(approval.proposedPayload)?.split('_')[0];
              if (moduleNs) void qc.invalidateQueries({ queryKey: [moduleNs] });
            },
          },
        )
      }
    />
  );
}
