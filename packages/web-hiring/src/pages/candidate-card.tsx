import {
  Avatar,
  Badge,
  formatRelative,
  KanbanCardShell,
  type KanbanCardShellProps,
} from '@seta/shared-ui';
import type { CandidateListItem } from '../api/hiring-client.ts';
import { fitScoreBadge } from './candidate-utils.ts';

const VISIBLE_SKILLS = 4;

function appliedLabel(appliedAt: string): string {
  const rel = formatRelative(appliedAt);
  return rel === 'now' ? 'just now' : `${rel} ago`;
}

function StarRating({ value }: { value: number | null }) {
  if (value == null) return <span className="text-sm text-secondary">Not rated yet</span>;
  const full = Math.round(value);
  return (
    <span
      role="img"
      aria-label={`Rating ${full} of 5`}
      className="text-sm"
      style={{ color: 'var(--color-icon-orange)' }}
    >
      {'★'.repeat(full)}
      <span style={{ color: 'var(--color-border-emphasized)' }}>{'★'.repeat(5 - full)}</span>
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
  const fit = fitScoreBadge(item.fit);
  const visibleSkills = item.skills.slice(0, VISIBLE_SKILLS);
  const hiddenSkillCount = item.skills.length - visibleSkills.length;

  const header = (
    <div className="flex items-start gap-2.5">
      <Avatar name={item.name} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-primary">{item.name}</span>
          {item.seniority && <Badge variant="neutral" label={item.seniority} />}
        </div>
        <div className="truncate text-sm text-secondary">{item.requisition_title}</div>
      </div>
      <Badge variant={fit.variant} className="flex-none" label={fit.text} />
    </div>
  );
  const footer = (
    <span className="text-sm text-secondary">
      {item.source ?? '—'} · {appliedLabel(item.applied_at)}
    </span>
  );

  return (
    <KanbanCardShell
      ariaLabel={`Candidate: ${item.name}`}
      onOpen={() => onSelect(item.candidate_id)}
      draggable={draggable}
      header={header}
      footer={footer}
    >
      <StarRating value={item.rating} />
      {item.skills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {visibleSkills.map((s) => (
            <Badge key={s.skill_id} variant="neutral" label={s.skill_name} />
          ))}
          {hiddenSkillCount > 0 && <Badge variant="neutral" label={`+${hiddenSkillCount}`} />}
        </div>
      )}
    </KanbanCardShell>
  );
}
