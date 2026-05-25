import { useMemo, useState } from 'react';
import type { WorkflowApprovalRow } from '../api/schemas.ts';

// Subset of the @seta/copilot-sdk ApprovalCard shape we render. We accept
// `unknown` proposedPayload and type-narrow here so a stale or malformed
// payload renders a graceful fallback instead of crashing the run page.
interface CandidateRowShape {
  id: string;
  label: string;
  secondary?: string;
  score?: number;
}
interface ApprovalCardShape {
  intent?: string;
  summary?: string;
  details?: Array<{ kind: string; items?: CandidateRowShape[] }>;
  primary?: { label: string; argsPatch?: { assigneeUserId?: string } };
  alternates?: Array<{ label: string; argsPatch?: { assigneeUserId?: string } }>;
  decline?: { label: string };
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
  /**
   * Fallback ApprovalCard payload to render when `approval.proposedPayload`
   * is empty (legacy rows projected before the adapter extracted suspendPayload).
   * The run page derives this from the Mastra snapshot it already fetches.
   */
  proposedPayloadFallback?: unknown;
}

function asCard(payload: unknown): ApprovalCardShape | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as ApprovalCardShape;
  return p.intent || p.primary || p.details ? p : null;
}

function candidateListFrom(card: ApprovalCardShape): CandidateRowShape[] {
  const block = card.details?.find((d) => d.kind === 'candidateList');
  return block?.items ?? [];
}

export function HitlApprovalCard({
  approval,
  canAct,
  onDecide,
  pending,
  proposedPayloadFallback,
}: HitlApprovalCardProps) {
  const card = asCard(approval.proposedPayload) ?? asCard(proposedPayloadFallback);
  const candidates = useMemo(() => (card ? candidateListFrom(card) : []), [card]);
  const primaryUserId = card?.primary?.argsPatch?.assigneeUserId ?? null;
  const primary = candidates.find((c) => c.id === primaryUserId) ?? candidates[0] ?? null;
  const [modifyOpen, setModifyOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [overrideId, setOverrideId] = useState<string>('');
  const [note, setNote] = useState('');

  const expiresLabel = new Date(approval.expiresAt).toLocaleString();

  return (
    <section
      aria-label="Your input needed"
      className="rounded-lg border border-hairline-strong bg-surface p-4 shadow-lg"
    >
      <header className="mb-2 flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full"
          style={{ background: 'var(--color-warning-ink)' }}
        />
        <h3 className="text-sm font-medium">{card?.intent ?? 'Your input needed'}</h3>
        <span className="ml-auto text-xs text-ink-subtle">expires {expiresLabel}</span>
      </header>

      {primary ? (
        <div className="mb-3 space-y-1 text-sm">
          <div>
            Approving will assign to <strong>{primary.label}</strong>
            {typeof primary.score === 'number' ? (
              <span className="ml-1 text-ink-subtle">· score {primary.score.toFixed(2)}</span>
            ) : null}
          </div>
          {primary.secondary ? (
            <div className="text-xs text-ink-subtle">{primary.secondary}</div>
          ) : null}
        </div>
      ) : (
        <div className="mb-3 space-y-1 text-sm">
          <div className="text-ink-subtle">
            {card?.summary ?? "We couldn't load the suggestions for this run."}
          </div>
          {!card ? (
            <div className="text-xs text-ink-subtle">
              Click <strong>Cancel run</strong> above, then click Suggest on the task again.
            </div>
          ) : null}
        </div>
      )}

      {candidates.length > 1 ? (
        <details className="mb-3 text-xs">
          <summary className="cursor-pointer text-ink-subtle hover:text-ink">
            See {candidates.length - 1} other suggestion{candidates.length - 1 === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 space-y-1 pl-2">
            {candidates
              .filter((c) => c.id !== primary?.id)
              .map((c) => (
                <li key={c.id} className="flex flex-col">
                  <span className="font-medium text-ink">
                    {c.label}
                    {typeof c.score === 'number' ? (
                      <span className="ml-1 text-ink-subtle">· {c.score.toFixed(2)}</span>
                    ) : null}
                  </span>
                  {c.secondary ? <span className="text-ink-subtle">{c.secondary}</span> : null}
                </li>
              ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {primary ? (
          <button
            type="button"
            disabled={!canAct || pending}
            onClick={() => onDecide({ decision: 'approve' })}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Approve — assign to {primary.label}
          </button>
        ) : null}
        {candidates.length > 1 ? (
          <button
            type="button"
            disabled={!canAct || pending}
            onClick={() => {
              setModifyOpen((s) => !s);
              setRejectOpen(false);
            }}
            className="rounded border border-hairline px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            Pick someone else…
          </button>
        ) : null}
        <button
          type="button"
          disabled={!canAct || pending}
          onClick={() => {
            setRejectOpen((s) => !s);
            setModifyOpen(false);
          }}
          className="rounded border border-hairline px-3 py-1.5 text-sm text-danger-ink hover:bg-surface-2 disabled:opacity-50"
        >
          {card?.decline?.label ?? 'Leave unassigned'}
        </button>
      </div>

      {modifyOpen && candidates.length > 1 ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-ink-subtle">
            Assign to
            <select
              value={overrideId}
              onChange={(e) => setOverrideId(e.target.value)}
              className="mt-1 w-full rounded border border-hairline bg-surface px-2 py-1 text-sm"
            >
              <option value="">Choose a person…</option>
              {candidates
                .filter((c) => c.id !== primary?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                    {typeof c.score === 'number' ? ` · ${c.score.toFixed(2)}` : ''}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!overrideId || pending}
            onClick={() => onDecide({ decision: 'modify', overrideUserId: overrideId, note })}
            className="rounded bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Assign
          </button>
        </div>
      ) : null}

      {rejectOpen ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-ink-subtle">
            Reason (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded border border-hairline bg-surface px-2 py-1 text-sm"
              rows={2}
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => onDecide({ decision: 'reject', note })}
            className="rounded bg-danger-ink px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Confirm — leave unassigned
          </button>
        </div>
      ) : null}

      {!canAct ? (
        <p className="mt-2 text-xs text-ink-subtle">
          You don&apos;t have permission to decide this one.
        </p>
      ) : null}
    </section>
  );
}
