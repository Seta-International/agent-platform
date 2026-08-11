import { Check, Clock, Sparkles } from 'lucide-react';
import { type ComponentType, type ReactNode, useEffect, useMemo, useState } from 'react';
import { useHitlDecision } from '../hooks/use-hitl-decision';
import { Button } from '../primitives/button';
import { type BlockProps, blockRenderers, type EntityRef } from './hitl-blocks';

interface CardShape {
  intent?: string;
  riskBadge?: 'write' | 'destructive' | 'external';
  summary?: string;
  details: Array<{ kind: string } & Record<string, unknown>>;
  primary: { label: string; argsPatch?: { assigneeUserIds?: string[] } };
  alternates?: Array<{ label: string; argsPatch?: { assigneeUserIds?: string[] } }>;
  decline: { label: string };
}

/**
 * Payload-free card (FUT-804 onwards): the client reports WHICH action it picked
 * and never a value, so the whole proposal is read-only. Detected by the absence
 * of an `entityList` block AND of the assignment card's `assigneeUserIds` —
 * assignment is the one card left that carries an editable payload, and it goes
 * away in FUT-806. Both halves matter: an assignment card whose primary has no
 * argsPatch still has candidates to pick from, and must keep the legacy body.
 */
export function isPayloadFreeCard(card: CardShape): boolean {
  if ((card.details ?? []).some((b) => b.kind === 'entityList')) return false;
  return card.primary?.argsPatch?.assigneeUserIds === undefined;
}

export type HitlCardDecision =
  // Legacy assignment card. Removed in FUT-806 with the candidate multi-select.
  | { decision: 'approve' | 'reject' | 'modify'; overrideUserIds?: string[]; note?: string }
  // Payload-free card: which action, never what.
  | { chosen: 'primary' | 'decline' };

export interface HitlCardProps {
  card: CardShape;
  canAct: boolean;
  pending?: boolean;
  expiresAt?: string;
  onDecide: (decision: HitlCardDecision) => void;
  renderEntity: (entity: EntityRef) => ReactNode;
  cardRenderers?: Record<string, ComponentType<BlockProps>>;
}

type RiskBadge = 'write' | 'destructive' | 'external';
const RISK_LABEL: Record<RiskBadge, string> = {
  write: 'Write',
  destructive: 'Destructive',
  external: 'External',
};
const RISK_CLASS: Record<RiskBadge, string> = {
  write: 'bg-accent-bg/12 text-accent',
  destructive: 'bg-error-muted text-error',
  external: 'bg-warning-muted text-warning',
};

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

// Blocks carry no stable id; derive a key from kind + content so React reconciles
// distinct blocks of the same kind without falling back to array index.
function blockKey(block: { kind: string }): string {
  try {
    return `${block.kind}:${JSON.stringify(block)}`;
  } catch {
    return block.kind;
  }
}

const countdownToneClass: Record<'ok' | 'soon' | 'urgent', string> = {
  ok: 'text-accent/80',
  soon: 'text-warning',
  urgent: 'text-error',
};

export function HitlCard({
  card,
  canAct,
  pending,
  expiresAt,
  onDecide,
  renderEntity,
  cardRenderers,
}: HitlCardProps) {
  const { selectedIds, toggle, toDecision } = useHitlDecision(card);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState('');

  // The primary button label must reflect the CURRENT selection, not the frozen
  // top-match label the backend baked in. Map each candidate's userId → its own
  // "<verb> <name>" label (already on primary/alternates as per-candidate patches)
  // so the verb stays backend-owned and this stays card-type agnostic. Fall back
  // to the static label whenever a selected id can't be resolved (cards without
  // per-candidate patches) or nothing is selected.
  const primaryLabel = useMemo(() => {
    if (selectedIds.length === 0) return card.primary.label;
    const byUser = new Map<string, string>();
    const topId = card.primary.argsPatch?.assigneeUserIds?.[0];
    if (topId) byUser.set(topId, card.primary.label);
    for (const alt of card.alternates ?? []) {
      const uid = alt.argsPatch?.assigneeUserIds?.[0];
      if (uid && alt.label) byUser.set(uid, alt.label);
    }
    const labels = selectedIds.map((id) => byUser.get(id));
    if (!labels.every((l): l is string => Boolean(l))) return card.primary.label;
    return labels.join(' · ');
  }, [card, selectedIds]);

  // Drive the countdown + expired flag with a 1s tick, but only when an
  // expiry is supplied — no timer (and never expired) when expiresAt is absent.
  const deadlineMs = expiresAt ? new Date(expiresAt).getTime() : undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadlineMs === undefined) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadlineMs]);

  const remaining = deadlineMs !== undefined ? formatRemaining(deadlineMs - now) : undefined;
  const expired = deadlineMs !== undefined && deadlineMs - now <= 0;
  const disabled = !canAct || Boolean(pending) || expired;

  const intent = card.intent ?? 'Your input needed';
  const payloadFree = isPayloadFreeCard(card);

  return (
    <section
      aria-label={intent}
      className="overflow-hidden rounded-xl border-[1.5px] border-accent-bg bg-body shadow-[0_0_0_4px_var(--color-accent-muted),0_10px_24px_-14px_rgb(0_0_0/0.25)]"
    >
      <header className="flex items-start gap-2.5 border-b border-accent-bg bg-accent-muted px-3.5 py-2">
        <Sparkles className="mt-[3px] size-3.5 shrink-0 text-accent" aria-hidden />
        <h3 className="line-clamp-2 flex-1 text-base font-semibold text-accent">{intent}</h3>
        {card.riskBadge ? (
          <span
            className={`shrink-0 rounded-sm px-1 text-xs font-medium uppercase tracking-wide ${RISK_CLASS[card.riskBadge] ?? ''}`}
          >
            {RISK_LABEL[card.riskBadge] ?? card.riskBadge}
          </span>
        ) : null}
        {remaining ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1 font-mono text-sm tabular-nums ${countdownToneClass[remaining.tier]}`}
            aria-live={remaining.tier === 'urgent' ? 'polite' : 'off'}
          >
            <Clock className="size-3" aria-hidden />
            {remaining.label}
          </span>
        ) : null}
      </header>

      <div className="px-3.5 py-3">
        {card.summary ? <p className="mb-2.5 text-sm text-secondary">{card.summary}</p> : null}

        <fieldset disabled={disabled} className="space-y-2.5">
          {card.details.map((block) => {
            // Built-in renderers win; cardRenderers is an escape hatch for unknown kinds.
            const Renderer = blockRenderers[block.kind] ?? cardRenderers?.[block.kind];
            if (!Renderer) return null;
            return (
              <Renderer
                key={blockKey(block)}
                block={block}
                selectedIds={selectedIds}
                onToggle={toggle}
                renderEntity={renderEntity}
              />
            );
          })}
        </fieldset>

        {payloadFree ? (
          // Read-only by design: in-card editing was dropped in Amendment B2, so
          // there is exactly one way to correct a proposal — ask the agent
          // (FUT-840). Cancel declines outright rather than opening the reason
          // note: a rejected preview writes nothing, so there is nothing to
          // explain. No input, select or textarea may appear on this path; the
          // component test asserts it, because it is FUT-804 AC5 made visible.
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="primary"
              isDisabled={disabled}
              onClick={() => onDecide({ chosen: 'primary' })}
              icon={<Check className="size-3.5" aria-hidden />}
              label={pending ? 'Applying…' : card.primary.label}
            />
            <Button
              type="button"
              variant="ghost"
              isDisabled={disabled}
              onClick={() => onDecide({ chosen: 'decline' })}
              label={card.decline.label}
              className="ml-auto"
            />
          </div>
        ) : !rejectOpen ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDecide(toDecision('approve'))}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent-bg px-3 py-1.5 text-base font-semibold text-on-accent shadow-sm transition hover:bg-accent-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="size-3.5" aria-hidden />
              {pending ? 'Working…' : primaryLabel}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setRejectOpen(true)}
              className="ml-auto rounded-md px-3 py-1.5 text-base text-error hover:bg-error-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {card.decline.label}
            </button>
          </div>
        ) : (
          <div className="mt-3.5 rounded-lg border border-border-strong bg-card p-2.5">
            <label className="block text-sm text-secondary">
              Reason (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full resize-none rounded-md border border-border-strong bg-body px-2.5 py-1.5 text-base text-primary placeholder:text-disabled focus:border-accent-bg focus:outline-none focus:ring-2 focus:ring-accent-bg/20"
              />
            </label>
            <div className="mt-2 flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setRejectOpen(false);
                  setNote('');
                }}
                className="rounded-md px-2.5 py-1.5 text-base text-secondary hover:bg-surface hover:text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDecide(toDecision('reject', note.trim() || undefined))}
                className="rounded-md bg-error px-3 py-1.5 text-base font-semibold text-on-error shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm decline
              </button>
            </div>
          </div>
        )}

        {!canAct ? (
          <p className="mt-3 rounded-md bg-surface px-2.5 py-1.5 text-sm text-secondary">
            You don&apos;t have permission to decide this one.
          </p>
        ) : expired ? (
          <p className="mt-3 rounded-md bg-error-muted px-2.5 py-1.5 text-sm text-error">
            This approval has expired.
          </p>
        ) : null}
      </div>
    </section>
  );
}
