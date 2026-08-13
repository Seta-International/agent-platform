import { ClickableCard, Heading, Text } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { Users } from 'lucide-react';
import type { RequisitionListRow } from '../api/hiring-client.ts';
import {
  daysLeft,
  deriveAttention,
  formatDate,
  furthestReachedIndex,
  PIPELINE_STAGE_LABEL,
  STAGES,
  stageCounts,
} from './requisition-format.ts';

const KIND_LABEL: Record<string, string> = { new: 'New', replacement: 'Replacement' };

// A requisition card is a glance-and-navigate surface: it shows the one signal that needs
// attention and opens the detail view on click. Lifecycle actions (pause, mark filled, cancel)
// live in the detail's footer, so the card carries no action menu of its own.
export function RequisitionCard({ r }: { r: RequisitionListRow }) {
  const navigate = useNavigate();

  const att = deriveAttention(r);
  // Per-stage bucket counts (FUT-558): each candidate counted once at their current stage;
  // the four numbers sum to applicants_count. `furthest` is the deepest stage anyone reached
  // — the card emphasises that column so the pipeline's leading edge reads at a glance.
  const counts = stageCounts(r.applicants_count, r.applicants);
  const furthest = furthestReachedIndex(r.applicants);
  const filled = r.openings_filled ?? Math.max(0, r.openings_total - r.openings_open);

  // Time-to-fill readout for open requisitions: days left / overdue, coloured only when it
  // needs attention (past due → red, within a week → amber). Non-open states show a status
  // word instead (att.statusWord).
  const dl = r.due_date ? daysLeft(r.due_date) : null;
  const dueLabel =
    dl === null
      ? ''
      : dl < 0
        ? `${-dl} day${dl === -1 ? '' : 's'} overdue`
        : dl === 0
          ? 'Due today'
          : `${dl} day${dl === 1 ? '' : 's'} left`;
  const dueColor =
    dl === null || dl > 7
      ? undefined
      : dl < 0
        ? 'var(--color-text-error)'
        : 'var(--color-text-warning)';

  // Account/project names come from local pm projections (null until pm emits / a project is
  // linked); grade is always local. Falls back gracefully to whatever is present.
  const subtitle = [r.account_name, r.project_name, r.grade ? `Grade ${r.grade}` : null]
    .filter(Boolean)
    .join(' • ');

  const go = () =>
    void navigate({
      to: '/hiring/requisitions',
      search: (prev: Record<string, unknown>) => ({ ...prev, selectedRequisitionId: r.id }),
    });

  return (
    <ClickableCard
      label={`Open ${r.title}`}
      onClick={go}
      padding={5}
      className="flex h-full flex-col"
      data-testid="requisition-card"
    >
      {/* Header: title + kind. */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <Heading level={3} maxLines={2}>
            {r.title}
          </Heading>
          {/* Kind as a flat uppercase tag, not a Badge pill — it labels identity, not a
              status, so it stays out of the enumerated-state Badge vocabulary. */}
          <Text type="supporting" color="secondary" className="shrink-0 uppercase tracking-wide">
            {KIND_LABEL[r.kind] ?? r.kind}
          </Text>
        </div>
        {subtitle && (
          <Text type="supporting" maxLines={1} display="block">
            {subtitle}
          </Text>
        )}
      </div>

      {/* Pipeline buckets (left) + the one hero signal (right). */}
      <div className="mt-5 flex items-end justify-between gap-4">
        <div className="flex gap-5">
          {STAGES.map((s, i) => (
            <div key={s} className="flex flex-col gap-0.5">
              <Text type="supporting">{PIPELINE_STAGE_LABEL[s]}</Text>
              <Text
                data-testid="stage-count"
                hasTabularNumbers
                weight={i === furthest ? 'bold' : 'normal'}
                color={i === furthest ? 'primary' : 'secondary'}
              >
                {counts[i]}
              </Text>
            </div>
          ))}
        </div>
        {/* One consistent right-hand signal: a lifecycle word for non-open states, otherwise the
            due-date countdown so every open card is comparable at a glance. */}
        <div className="flex flex-col items-end text-right">
          {att.statusWord ? (
            <Text weight="semibold" style={{ color: att.toneVar }}>
              {att.statusWord}
            </Text>
          ) : r.due_date ? (
            <>
              <Text weight="semibold" style={dueColor ? { color: dueColor } : undefined}>
                {dueLabel}
              </Text>
              <Text type="supporting" display="block">
                Due {formatDate(r.due_date)}
              </Text>
            </>
          ) : (
            <Text type="supporting">No due date</Text>
          )}
        </div>
      </div>

      {/* Footer pinned to the bottom so cards in a row align: applicants + headcount readout. */}
      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="flex items-center gap-1.5">
          <Users className="size-4 text-secondary" aria-hidden />
          <Text type="supporting">{r.applicants_count} applicants</Text>
        </span>
        {r.openings_total > 0 && (
          <Text type="supporting">
            {filled}/{r.openings_total} filled
          </Text>
        )}
      </div>
    </ClickableCard>
  );
}
