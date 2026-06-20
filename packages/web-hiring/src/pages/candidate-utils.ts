import type { CandidateListItem, CandStage, Fit } from '../api/hiring-client.ts';

export const BOARD_COLUMNS: { id: CandStage | 'hired'; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'screening', label: 'Screening' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' },
  { id: 'hired', label: 'Hired' },
];

export type BoardGroups = Record<CandStage | 'hired', CandidateListItem[]>;

export function boardColumns(items: CandidateListItem[]): BoardGroups {
  const groups: BoardGroups = { new: [], screening: [], interview: [], offer: [], hired: [] };
  for (const it of items) {
    if (it.status === 'hired') groups.hired.push(it);
    else if (it.status === 'active') groups[it.stage].push(it);
    // rejected / transferred never appear on the board
  }
  return groups;
}

export function fitLabel(fit: Fit): { text: string; strong: boolean } {
  if (fit.required === 0) return { text: 'No skills required', strong: false };
  return { text: `${fit.met}/${fit.required} skills`, strong: fit.strong };
}

export function resolveStageDrop(args: {
  draggableId: string;
  source: string;
  destination: string | null;
  items: CandidateListItem[];
}): { application_id: string; to: CandStage; expected_version: number } | null {
  const { draggableId, source, destination, items } = args;
  if (!destination || destination === source) return null;
  if (destination === 'hired') return null; // Hired is offer-driven (deferred); not a drop target
  const it = items.find((i) => i.application_id === draggableId);
  if (!it) return null;
  return {
    application_id: draggableId,
    to: destination as CandStage,
    expected_version: it.version,
  };
}
