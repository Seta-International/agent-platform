import { useState } from 'react';
import type { WorkflowApprovalRow } from '../api/schemas.ts';

interface ProposedShape {
  userId?: string;
  displayName?: string;
  rationale?: string;
}

export type HitlDecisionInput =
  | { decision: 'approve' }
  | { decision: 'reject'; note?: string }
  | { decision: 'modify'; overrideUserId: string; note?: string };

export interface HitlApprovalCardProps {
  approval: WorkflowApprovalRow;
  canAct: boolean;
  onDecide: (args: HitlDecisionInput) => void;
  pending?: boolean;
}

export function HitlApprovalCard({ approval, canAct, onDecide, pending }: HitlApprovalCardProps) {
  const proposed = (approval.proposedPayload ?? null) as ProposedShape | null;
  const [modifyOpen, setModifyOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [overrideId, setOverrideId] = useState('');
  const [note, setNote] = useState('');

  return (
    <section
      aria-label="Your input needed"
      className="rounded-lg border border-[var(--color-hairline-strong)] bg-[var(--color-surface)] p-4 shadow-lg"
    >
      <header className="mb-2 flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full"
          style={{ background: 'var(--color-warning-ink)' }}
        />
        <h3 className="text-sm font-medium">Your call</h3>
        <span className="ml-auto text-xs text-[var(--color-ink-subtle)]">
          expires {new Date(approval.expiresAt).toLocaleString()}
        </span>
      </header>

      {proposed ? (
        <div className="mb-3 text-sm">
          Assign this to <strong>{proposed.displayName ?? `user ${proposed.userId ?? '?'}`}</strong>
          ?
          {proposed.rationale ? (
            <div className="mt-1 text-xs text-[var(--color-ink-subtle)]">{proposed.rationale}</div>
          ) : null}
        </div>
      ) : (
        <div className="mb-3 text-sm text-[var(--color-ink-subtle)]">
          Waiting on your decision. I don&apos;t have a suggestion this time.
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canAct || pending || !proposed}
          onClick={() => onDecide({ decision: 'approve' })}
          className="rounded bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={!canAct || pending}
          onClick={() => {
            setModifyOpen((s) => !s);
            setRejectOpen(false);
          }}
          className="rounded border border-[var(--color-hairline)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)] disabled:opacity-50"
        >
          Modify…
        </button>
        <button
          type="button"
          disabled={!canAct || pending}
          onClick={() => {
            setRejectOpen((s) => !s);
            setModifyOpen(false);
          }}
          className="rounded border border-[var(--color-hairline)] px-3 py-1.5 text-sm text-[var(--color-danger-ink)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
        >
          Reject
        </button>
      </div>

      {modifyOpen ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-[var(--color-ink-subtle)]">
            Assign to someone else (user ID)
            <input
              type="text"
              value={overrideId}
              onChange={(e) => setOverrideId(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2 py-1 text-sm font-mono"
              placeholder="user-uuid"
            />
          </label>
          <button
            type="button"
            disabled={!overrideId || pending}
            onClick={() => onDecide({ decision: 'modify', overrideUserId: overrideId, note })}
            className="rounded bg-[var(--color-primary)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Reassign
          </button>
        </div>
      ) : null}

      {rejectOpen ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-[var(--color-ink-subtle)]">
            Reason (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2 py-1 text-sm"
              rows={2}
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => onDecide({ decision: 'reject', note })}
            className="rounded bg-[var(--color-danger-ink)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      ) : null}

      {!canAct ? (
        <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
          You don&apos;t have permission to decide this one.
        </p>
      ) : null}
    </section>
  );
}
