import { Check, Clock, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowApprovalRow } from '../api/schemas.ts';
import {
  type ApprovalCardShape,
  asCard,
  type CandidateRowShape,
  isDedupCard,
} from './approval-card-shape.ts';

export type HitlDecisionInput =
  | { decision: 'approve' }
  | { decision: 'reject'; note?: string }
  | { decision: 'modify'; overrideUserIds: string[]; note?: string }
  | { decision: 'approve'; alternateIndices: number[] };

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

function candidateListFrom(card: ApprovalCardShape): CandidateRowShape[] {
  const block = card.details?.find((d) => d.kind === 'candidateList');
  return block?.items ?? [];
}

function initialsOf(label: string): string {
  const parts = label.split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join('') || '?'
  ).toUpperCase();
}

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function avatarStyle(id: string): React.CSSProperties {
  const hue = hueFromId(id);
  return {
    background: `hsl(${hue} 70% 92%)`,
    color: `hsl(${hue} 55% 24%)`,
  };
}

export function CandidateAvatar({ id, label }: { id: string; label: string }) {
  return (
    <span
      aria-hidden
      className="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold tracking-wide"
      style={avatarStyle(id)}
    >
      {initialsOf(label)}
    </span>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  return (
    <span
      aria-hidden
      className="relative inline-block h-1 w-12 overflow-hidden rounded-full bg-hairline align-middle"
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-primary"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

function formatRemaining(ms: number): { label: string; tier: 'ok' | 'soon' | 'urgent' } {
  if (ms <= 0) return { label: 'expired', tier: 'urgent' };
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  let label: string;
  if (d > 0) label = h > 0 ? `${d}d ${h}h left` : `${d}d left`;
  else if (h > 0) label = m > 0 ? `${h}h ${m}m left` : `${h}h left`;
  else if (m > 0) label = `${m}m ${s.toString().padStart(2, '0')}s left`;
  else label = `${s}s left`;
  const tier: 'ok' | 'soon' | 'urgent' = ms < 30_000 ? 'urgent' : ms < 120_000 ? 'soon' : 'ok';
  return { label, tier };
}

const countdownToneClass: Record<'ok' | 'soon' | 'urgent', string> = {
  ok: 'text-primary-ink/80',
  soon: 'text-warning-ink',
  urgent: 'text-danger-ink',
};

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
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
  const primaryIds = useMemo(
    () => (card?.primary?.argsPatch?.assigneeUserIds as string[] | undefined) ?? [],
    [card?.primary?.argsPatch?.assigneeUserIds],
  );
  const primarySet = useMemo(() => new Set<string>(primaryIds), [primaryIds]);

  const [selected, setSelected] = useState<Set<string>>(primarySet);
  // If the proposal changes (e.g. SSE update), re-baseline the selection.
  const prevPrimaryIds = useRef(primaryIds);
  if (prevPrimaryIds.current !== primaryIds) {
    prevPrimaryIds.current = primaryIds;
    setSelected(new Set<string>(primaryIds));
  }

  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState('');

  const deadlineMs = new Date(approval.expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = formatRemaining(deadlineMs - now);
  const expired = deadlineMs - now <= 0;
  const disabled = !canAct || pending || expired;

  const isDirty = !setsEqual(selected, primarySet);
  const canApprove = selected.size > 0;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitApprove() {
    if (!canApprove || disabled) return;
    if (isDirty) {
      onDecide({ decision: 'modify', overrideUserIds: [...selected], note: '' });
    } else {
      onDecide({ decision: 'approve' });
    }
  }

  // Sort by score desc only — do NOT re-sort on selection change (causes layout jump).
  const ranked = useMemo(() => {
    return [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [candidates]);

  const cardIntent = card?.intent ?? 'Your input needed';
  const selectedRows = useMemo(
    () =>
      [...selected]
        .map((id) => candidates.find((c) => c.id === id))
        .filter((c): c is CandidateRowShape => Boolean(c)),
    [selected, candidates],
  );

  const [selectedLinks, setSelectedLinks] = useState<Set<number>>(new Set());

  // --- Dedup card: render Link / Delete / Leave buttons ---
  if (card && isDedupCard(card)) {
    function toggleLink(idx: number) {
      setSelectedLinks((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
    }

    return (
      <section
        aria-label="Duplicate check"
        className="overflow-hidden rounded-xl border-[1.5px] border-primary-border bg-canvas shadow-[0_0_0_4px_var(--color-primary-tint),0_10px_24px_-14px_rgb(0_0_0/0.25)]"
      >
        <header className="flex items-start gap-2.5 border-b border-primary-border bg-primary-tint px-3.5 py-2">
          <Sparkles className="mt-[3px] size-3.5 shrink-0 text-primary" aria-hidden />
          <h3 className="line-clamp-2 flex-1 text-body-sm font-semibold text-primary-ink">
            {cardIntent}
          </h3>
          <span
            className={`inline-flex shrink-0 items-center gap-1 font-mono text-caption tabular-nums ${countdownToneClass[remaining.tier]}`}
            aria-live={remaining.tier === 'urgent' ? 'polite' : 'off'}
          >
            <Clock className="size-3" aria-hidden />
            {remaining.label}
          </span>
        </header>

        <div className="px-3.5 py-3">
          {candidates.length > 0 ? (
            <fieldset disabled={disabled} className="space-y-0.5">
              <legend className="mb-1.5 flex w-full items-center justify-between text-eyebrow uppercase text-ink-subtle">
                <span>Possible duplicates — select to link</span>
                {selectedLinks.size > 0 ? (
                  <span className="font-mono text-caption normal-case tracking-normal text-ink-tertiary">
                    {selectedLinks.size} selected
                  </span>
                ) : null}
              </legend>
              <ul className="space-y-0.5">
                {candidates.map((c, idx) => {
                  const isSelected = selectedLinks.has(idx);
                  return (
                    <li key={c.id}>
                      <label
                        className={`relative flex cursor-pointer items-start gap-2.5 rounded-md border px-2 py-2 transition ${
                          isSelected
                            ? 'border-primary-border bg-primary-tint/60'
                            : 'border-transparent hover:bg-surface-2'
                        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isSelected}
                          onChange={() => toggleLink(idx)}
                          disabled={disabled}
                        />
                        <span
                          aria-hidden
                          className={`mt-px grid size-4 shrink-0 place-items-center rounded border transition ${
                            isSelected
                              ? 'border-primary bg-primary text-on-primary'
                              : 'border-hairline-strong bg-canvas'
                          }`}
                        >
                          {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="block text-body-sm font-medium leading-snug text-ink">
                            {c.label}
                          </span>
                          {c.secondary ? (
                            <span className="mt-0.5 block text-caption leading-snug text-ink-subtle">
                              {c.secondary}
                            </span>
                          ) : null}
                        </div>
                        {typeof c.score === 'number' ? (
                          <div className="mt-1 flex shrink-0 items-center gap-1.5">
                            <ConfidenceBar score={c.score} />
                            <span className="w-10 text-right font-mono text-caption tabular-nums text-ink-subtle">
                              {Math.round(c.score * 100)}%
                            </span>
                          </div>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : null}

          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={selectedLinks.size === 0 || disabled}
              onClick={() => {
                if (selectedLinks.size > 0) {
                  onDecide({ decision: 'approve', alternateIndices: [...selectedLinks] });
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-body-sm font-semibold text-on-primary shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle disabled:shadow-none"
            >
              <Check className="size-3.5" aria-hidden />
              {pending
                ? 'Linking…'
                : selectedLinks.size > 1
                  ? `Link ${selectedLinks.size} tickets`
                  : 'Link ticket'}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDecide({ decision: 'approve' })}
              className="rounded-md border border-hairline bg-surface-1 px-3 py-1.5 text-body-sm font-medium text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Keep as new task
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDecide({ decision: 'reject' })}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body-sm text-danger-ink hover:bg-danger-tint disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Delete this ticket
            </button>
          </div>

          {!canAct ? (
            <p className="mt-3 rounded-md bg-surface-2 px-2.5 py-1.5 text-caption text-ink-subtle">
              You don&apos;t have permission to decide this one.
            </p>
          ) : expired ? (
            <p className="mt-3 rounded-md bg-danger-tint px-2.5 py-1.5 text-caption text-danger-ink">
              This approval has expired. Cancel the run and try again.
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Your input needed"
      className="overflow-hidden rounded-xl border-[1.5px] border-primary-border bg-canvas shadow-[0_0_0_4px_var(--color-primary-tint),0_10px_24px_-14px_rgb(0_0_0/0.25)]"
    >
      <header className="flex items-start gap-2.5 border-b border-primary-border bg-primary-tint px-3.5 py-2">
        <Sparkles className="mt-[3px] size-3.5 shrink-0 text-primary" aria-hidden />
        <h3 className="line-clamp-2 flex-1 text-body-sm font-semibold text-primary-ink">
          {cardIntent}
        </h3>
        <span
          className={`inline-flex shrink-0 items-center gap-1 font-mono text-caption tabular-nums ${countdownToneClass[remaining.tier]}`}
          aria-live={remaining.tier === 'urgent' ? 'polite' : 'off'}
        >
          <Clock className="size-3" aria-hidden />
          {remaining.label}
        </span>
      </header>

      <div className="px-3.5 py-3">
        {candidates.length > 0 ? (
          <fieldset disabled={disabled} className="space-y-0.5">
            <legend className="mb-1.5 flex w-full items-center justify-between text-eyebrow uppercase text-ink-subtle">
              <span>Pick one or more teammates</span>
              <span className="font-mono text-caption normal-case tracking-normal text-ink-tertiary">
                {selected.size} selected
              </span>
            </legend>
            <ul className="space-y-0.5">
              {ranked.map((c) => {
                const isSelected = selected.has(c.id);
                const isPrimary = primarySet.has(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={`relative flex cursor-pointer items-start gap-2.5 rounded-md border px-2 py-2 transition ${
                        isSelected
                          ? 'border-primary-border bg-primary-tint/60'
                          : 'border-transparent hover:bg-surface-2'
                      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isSelected}
                        onChange={() => toggle(c.id)}
                        aria-label={`Assign to ${c.label}`}
                      />
                      <span
                        aria-hidden
                        className={`mt-px grid size-4 shrink-0 place-items-center rounded border transition ${
                          isSelected
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-hairline-strong bg-canvas'
                        }`}
                      >
                        {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      <CandidateAvatar id={c.id} label={c.label} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="truncate text-body-sm font-medium text-ink">
                            {c.label}
                          </span>
                          {isPrimary ? (
                            <span className="shrink-0 rounded-sm bg-primary/12 px-1 text-[10px] font-medium uppercase tracking-wide text-primary-ink">
                              top match
                            </span>
                          ) : null}
                        </div>
                        {c.secondary ? (
                          <div className="mt-0.5 text-caption leading-snug text-ink-subtle">
                            {c.secondary}
                          </div>
                        ) : null}
                      </div>
                      {typeof c.score === 'number' ? (
                        <div className="mt-1 flex shrink-0 items-center gap-1.5">
                          <ConfidenceBar score={c.score} />
                          <span className="w-10 text-right font-mono text-caption tabular-nums text-ink-subtle">
                            {Math.round(c.score * 100)}%
                          </span>
                        </div>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : (
          <div className="rounded-md border border-dashed border-hairline-strong bg-surface-2 px-3 py-2.5 text-body-sm text-ink-subtle">
            {card?.summary ?? "We couldn't load the suggestions for this run."}
            {!card ? (
              <div className="mt-1 text-caption">
                Click <strong>Cancel run</strong> above, then click Suggest on the task again.
              </div>
            ) : null}
          </div>
        )}

        {selectedRows.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-1 text-caption text-ink-subtle">
            <span>Will assign to:</span>
            {selectedRows.map((c, i) => (
              <span key={c.id} className="text-ink">
                {c.label}
                {i < selectedRows.length - 1 ? ',' : ''}
              </span>
            ))}
            {isDirty ? (
              <button
                type="button"
                onClick={() => setSelected(new Set<string>(primaryIds))}
                className="ml-1 text-primary-ink hover:underline"
              >
                Reset to top match
              </button>
            ) : null}
          </div>
        ) : null}

        {!rejectOpen ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={!canApprove || disabled}
              onClick={submitApprove}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-body-sm font-semibold text-on-primary shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="size-3.5" aria-hidden />
              {pending ? 'Approving…' : 'Approve'}
              {selected.size > 1 ? (
                <span className="rounded-full bg-canvas/25 px-1.5 py-px font-mono text-[10px] tabular-nums">
                  {selected.size}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setRejectOpen(true)}
              className="ml-auto rounded-md px-3 py-1.5 text-body-sm text-danger-ink hover:bg-danger-tint disabled:cursor-not-allowed disabled:opacity-50"
            >
              {card?.decline?.label ?? 'Leave unassigned'}
            </button>
          </div>
        ) : (
          <div className="mt-3.5 rounded-lg border border-hairline-strong bg-surface-1 p-2.5">
            <label className="block text-caption text-ink-subtle">
              Reason (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="e.g. nobody on the bench has the right skills…"
                className="mt-1 w-full resize-none rounded-md border border-hairline-strong bg-canvas px-2.5 py-1.5 text-body-sm text-ink placeholder:text-ink-tertiary focus:border-primary-border focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <div className="mt-2 flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setRejectOpen(false);
                  setNote('');
                }}
                className="rounded-md px-2.5 py-1.5 text-body-sm text-ink-subtle hover:bg-surface-2 hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onDecide({ decision: 'reject', note })}
                className="rounded-md bg-danger px-3 py-1.5 text-body-sm font-semibold text-on-destructive shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm decline
              </button>
            </div>
          </div>
        )}

        {!canAct ? (
          <p className="mt-3 rounded-md bg-surface-2 px-2.5 py-1.5 text-caption text-ink-subtle">
            You don&apos;t have permission to decide this one.
          </p>
        ) : expired ? (
          <p className="mt-3 rounded-md bg-danger-tint px-2.5 py-1.5 text-caption text-danger-ink">
            This approval has expired. Cancel the run and try again.
          </p>
        ) : null}
      </div>
    </section>
  );
}
