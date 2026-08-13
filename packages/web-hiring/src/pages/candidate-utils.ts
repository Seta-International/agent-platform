import type { CandidateListItem, CandStage, Fit } from '../api/hiring-client.ts';

export type BoardColumnId = CandStage | 'hired' | 'rejected';

export const BOARD_COLUMNS: { id: BoardColumnId; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'screening', label: 'Screening' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' },
  { id: 'hired', label: 'Hired' },
  { id: 'rejected', label: 'Rejected' },
];

export type BoardGroups = Record<BoardColumnId, CandidateListItem[]>;

export function boardColumns(items: CandidateListItem[]): BoardGroups {
  const groups: BoardGroups = {
    new: [],
    screening: [],
    interview: [],
    offer: [],
    hired: [],
    rejected: [],
  };
  for (const it of items) {
    if (it.status === 'hired') groups.hired.push(it);
    else if (it.status === 'rejected') groups.rejected.push(it);
    else if (it.status === 'active') groups[it.stage].push(it);
    // transferred / cancelled never appear on the board
  }
  return groups;
}

export function fitLabel(fit: Fit): { text: string; strong: boolean } {
  if (fit.required === 0) return { text: 'No skills required', strong: false };
  return { text: `${fit.met}/${fit.required} skills`, strong: fit.strong };
}

export function fitScoreBadge(fit: Fit): {
  text: string;
  variant: 'success' | 'warning' | 'neutral';
} {
  if (fit.required === 0) return { text: '—', variant: 'neutral' };
  const pct = Math.round(fit.score * 100);
  const variant = pct >= 85 ? 'success' : pct >= 70 ? 'warning' : 'neutral';
  return { text: `${pct}%`, variant };
}

/** Single source of truth for stage color — shared by the board's column-header dots and the
 * stat bar's segment numbers so the two stay visually in sync. 6 distinct tokens, one per
 * stage/outcome (no two stages share a color). */
export const STAGE_COLOR: Record<CandStage | 'hired' | 'cancelled' | 'rejected', string> = {
  new: 'var(--color-accent)',
  screening: 'var(--color-success)',
  interview: 'var(--color-icon-purple)',
  offer: 'var(--color-icon-orange)',
  hired: 'var(--color-icon-teal)',
  cancelled: 'var(--color-error)',
  rejected: 'var(--color-error)',
};

export const COLUMN_EMPTY_COPY: Record<BoardColumnId, { title: string; description: string }> = {
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
  rejected: {
    title: 'No rejected candidates',
    description: 'Candidates you reject will be archived here.',
  },
};

export type StageMove = {
  kind: 'stage';
  application_id: string;
  to: CandStage;
  expected_version: number;
};
export type HireMove = {
  kind: 'hire';
  application_id: string;
  expected_version: number;
};

export function resolveStageDrop(args: {
  draggableId: string;
  source: string;
  destination: string | null;
  items: CandidateListItem[];
}): StageMove | HireMove | null {
  const { draggableId, source, destination, items } = args;
  if (!destination || destination === source) return null;
  if (destination === 'rejected') return null; // Rejection goes through the reason dialog, not a drop
  const it = items.find((i) => i.application_id === draggableId);
  if (!it) return null;
  if (destination === 'hired')
    return { kind: 'hire', application_id: draggableId, expected_version: it.version };
  return {
    kind: 'stage',
    application_id: draggableId,
    to: destination as CandStage,
    expected_version: it.version,
  };
}
