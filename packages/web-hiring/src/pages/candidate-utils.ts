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

export function fitScoreBadge(fit: Fit): {
  text: string;
  variant: 'success' | 'warning' | 'secondary';
} {
  if (fit.required === 0) return { text: '—', variant: 'secondary' };
  const pct = Math.round(fit.score * 100);
  const variant = pct >= 85 ? 'success' : pct >= 70 ? 'warning' : 'secondary';
  return { text: `${pct}%`, variant };
}

/** Single source of truth for stage color — shared by the board's column-header dots and the
 * stat bar's segment numbers so the two stay visually in sync. 6 distinct tokens, one per
 * stage/outcome (no two stages share a color). */
export const STAGE_COLOR: Record<CandStage | 'hired' | 'cancelled', string> = {
  new: 'var(--color-primary)',
  screening: 'var(--color-success)',
  interview: 'var(--color-group-theme-purple)',
  offer: 'var(--color-group-theme-orange)',
  hired: 'var(--color-group-theme-teal)',
  cancelled: 'var(--color-danger)',
};

export const COLUMN_EMPTY_COPY: Record<
  CandStage | 'hired',
  { title: string; description: string }
> = {
  new: { title: 'No new candidates', description: 'New applicants will show up here.' },
  screening: {
    title: 'No candidates in screening',
    description: 'Move a candidate here to start screening.',
  },
  interview: {
    title: 'No interviews scheduled',
    description: 'Move a candidate here once they’re ready to interview.',
  },
  offer: { title: 'No offers yet', description: 'Move a candidate here to extend an offer.' },
  hired: {
    title: 'No hired candidates yet',
    description: 'Move candidates here when they become your new teammates.',
  },
};

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
