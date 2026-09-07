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

export type HitlCardDecision =
  // Payload-free card: WHICH branch, never what. The shape GenericResumeBody
  // already accepts, so no translation layer sits between them.
  { chosen: 'primary' | 'alternate' | 'decline'; alternateIndex?: number; note?: string };

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
  const { selectedIds, toggle, branch } = useHitlDecision(card);

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
  // Which of D12's two displays this card gets. Rows present → the rows are the
  // selector; rows absent → the alternates are buttons.
  const hasEntityList = (card.details ?? []).some((b) => b.kind === 'entityList');

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

        {
          // Read-only by design: in-card editing was dropped in Amendment B2, so
          // there is exactly one way to correct a proposal — ask the agent
          // (FUT-840). Cancel declines outright rather than opening the reason
          // note: a rejected preview writes nothing, so there is nothing to
          // explain. No input, select or textarea may appear on this path; the
          // component test asserts it, because it is FUT-804 AC5 made visible.
          //
          // Two displays, one mechanism (design D12). A card with an entityList
          // selects its branch through the rows above; a card without one
          // renders its alternates here as secondary buttons. Both emit
          // {chosen, alternateIndex} and neither offers anywhere to type.
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="primary"
              // A null branch means the selected row matches no server-authored
              // action. Refusing to submit is what stops it silently resolving
              // to primary.
              isDisabled={disabled || branch === null}
              onClick={() => branch && onDecide(branch)}
              icon={<Check className="size-3.5" aria-hidden />}
              label={pending ? 'Applying…' : primaryLabel}
            />
            {!hasEntityList
              ? (card.alternates ?? []).map((alt, i) => (
                  <Button
                    key={alt.label}
                    type="button"
                    variant="secondary"
                    isDisabled={disabled}
                    onClick={() => onDecide({ chosen: 'alternate', alternateIndex: i })}
                    label={alt.label}
                  />
                ))
              : null}
            <Button
              type="button"
              variant="ghost"
              isDisabled={disabled}
              onClick={() => onDecide({ chosen: 'decline' })}
              label={card.decline.label}
              className="ml-auto"
            />
          </div>
        }

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
