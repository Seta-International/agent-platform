import {
  Avatar,
  AvatarFallback,
  Badge,
  formatRelative,
  KanbanCardShell,
  type KanbanCardShellProps,
} from '@seta/shared-ui';
import { User } from 'lucide-react';
import type { CandidateListItem } from '../api/hiring-client.ts';
import { fitScoreBadge } from './candidate-utils.ts';

const VISIBLE_SKILLS = 3;

function appliedLabel(appliedAt: string): string {
  const rel = formatRelative(appliedAt);
  return rel === 'now' ? 'just now' : `${rel} ago`;
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
  return (
    <KanbanCardShell
      ariaLabel={`Candidate: ${item.name}`}
      onOpen={() => onSelect(item.candidate_id)}
      draggable={draggable}
    >
      <div className="flex items-start gap-2.5">
        <Avatar className="size-9">
          <AvatarFallback>
            <User className="size-4" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-ink">{item.name}</div>
          <div className="mt-1 truncate text-caption text-ink-muted">{item.requisition_title}</div>
          <div className="mt-1 text-caption text-ink-subtle">
            {item.source ?? '—'} · {appliedLabel(item.applied_at)}
          </div>
        </div>
        <Badge variant={fit.variant} className="flex-none" label={fit.text} />
      </div>

      {item.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {visibleSkills.map((s) => (
            <Badge key={s.skill_id} variant="neutral" label={s.skill_name} />
          ))}
          {hiddenSkillCount > 0 && <Badge variant="neutral" label={`+${hiddenSkillCount}`} />}
        </div>
      )}
    </KanbanCardShell>
  );
}
