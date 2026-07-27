import {
  Badge,
  formatRelative,
  KanbanCardShell,
  type KanbanCardShellProps,
  Text,
  Tooltip,
} from '@seta/shared-ui';
import { Star } from 'lucide-react';
import type { CandidateListItem } from '../api/hiring-client.ts';
import { fitLabel } from './candidate-utils.ts';

function appliedLabel(appliedAt: string): string {
  const rel = formatRelative(appliedAt);
  return rel === 'now' ? 'just now' : `${rel} ago`;
}

// Rating mirrors the detail drawer: a plain "n/5" (achromatic), not a coloured star row.
function RatingLine({ value }: { value: number | null }) {
  if (value == null) return <Text type="supporting">Not rated yet</Text>;
  return (
    <span className="flex items-center gap-1.5 text-secondary">
      <Star className="size-3.5" aria-hidden />
      <Text type="supporting">{value}/5</Text>
    </span>
  );
}

export function CandidateCard({
  item,
  onSelect,
  draggable,
}: {
  item: CandidateListItem;
  onSelect: (candidateId: string) => void;
  draggable: KanbanCardShellProps['draggable'];
}) {
  // Fit speaks the same language as the detail drawer — "n/m skills", not a percentage.
  const fit = fitLabel(item.fit);
  // Hovering the fit badge lists the requisition's required skills — same affordance as the
  // candidate detail drawer, so a recruiter can see what "n/m" is measured against without opening.
  const fitBadge = <Badge variant={fit.strong ? 'success' : 'neutral'} label={fit.text} />;

  const header = (
    <div className="min-w-0 flex-1">
      {/* Name + seniority share a line (name truncates first); the requisition title gets its
          own full-width line below, so it shows as much as fits and only ellipsises when it
          genuinely overflows. Nothing else competes for that line. */}
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1">
          <Text weight="medium" maxLines={1} display="block">
            {item.name}
          </Text>
        </span>
        {item.seniority && <Badge variant="neutral" label={item.seniority} className="flex-none" />}
      </div>
      <Text type="supporting" maxLines={1} display="block" className="mt-0.5">
        {item.requisition_title}
      </Text>
    </div>
  );
  const footer = (
    <Text type="supporting">
      {item.source ?? '—'} · {appliedLabel(item.applied_at)}
    </Text>
  );

  return (
    <KanbanCardShell
      ariaLabel={`Candidate: ${item.name}`}
      onOpen={() => onSelect(item.candidate_id)}
      draggable={draggable}
      header={header}
      footer={footer}
    >
      {/* Decision-support line: skill fit + rating, together. */}
      <div className="flex items-center gap-2.5">
        {item.required_skills.length > 0 ? (
          <Tooltip
            content={
              <div className="flex flex-col gap-0.5">
                {item.required_skills.map((s) => (
                  <span key={s.skill_id}>
                    {s.skill_name}
                    {s.level ? ` · ${s.level}/5` : ''}
                  </span>
                ))}
              </div>
            }
          >
            {fitBadge}
          </Tooltip>
        ) : (
          fitBadge
        )}
        <RatingLine value={item.rating} />
      </div>
    </KanbanCardShell>
  );
}
