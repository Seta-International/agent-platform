import { Badge, KanbanCardShell, type KanbanCardShellProps } from '@seta/shared-ui';
import type { CandidateListItem } from '../api/hiring-client.ts';
import { fitLabel } from './candidate-utils.ts';

export function CandidateCard({
  item,
  onSelect,
  draggable,
}: {
  item: CandidateListItem;
  onSelect: (candidateId: string) => void;
  draggable: KanbanCardShellProps['draggable'];
}) {
  const fit = fitLabel(item.fit);
  return (
    <KanbanCardShell
      ariaLabel={`Candidate: ${item.name}`}
      onOpen={() => onSelect(item.candidate_id)}
      draggable={draggable}
    >
      <div className="font-medium text-ink">{item.name}</div>
      <div className="text-caption text-ink-muted">
        {item.seniority ?? '—'} · {item.source ?? '—'}
      </div>
      <div className="mt-1 text-caption text-ink-muted">{item.requisition_title}</div>
      <div className="mt-2">
        <Badge variant={fit.strong ? 'success' : 'secondary'}>{fit.text}</Badge>
      </div>
    </KanbanCardShell>
  );
}
