import { Badge } from '@seta/shared-ui';
import type { CandidateListItem } from '../api/hiring-client.ts';
import { fitLabel } from './candidate-utils.ts';

export function CandidateCard({
  item,
  onSelect,
}: {
  item: CandidateListItem;
  onSelect: (candidateId: string) => void;
}) {
  const fit = fitLabel(item.fit);
  return (
    <button
      type="button"
      onClick={() => onSelect(item.candidate_id)}
      className="w-full rounded-lg border border-hairline bg-surface-1 p-3 text-left hover:border-primary"
    >
      <div className="font-medium text-ink">{item.name}</div>
      <div className="text-caption text-ink-muted">
        {item.seniority ?? '—'} · {item.source ?? '—'}
      </div>
      <div className="mt-1 text-caption text-ink-muted">{item.requisition_title}</div>
      <div className="mt-2">
        <Badge variant={fit.strong ? 'success' : 'secondary'}>{fit.text}</Badge>
      </div>
    </button>
  );
}
