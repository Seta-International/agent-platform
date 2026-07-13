import type { ReqStage, ReqStatus } from '../api/hiring-client.ts';

export const STAGES: ReqStage[] = ['sourcing', 'screening', 'interview', 'offer'];
export const STAGE_LABEL: Record<ReqStage, string> = {
  sourcing: 'Sourcing',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
};

export const STATUS_LABEL: Record<ReqStatus, string> = {
  open: 'Open',
  on_hold: 'On hold',
  filled: 'Filled',
  cancelled: 'Cancelled',
};
export const STATUS_BADGE_CLASS: Record<ReqStatus, string> = {
  open: 'border-transparent bg-success-tint text-success-ink',
  on_hold: 'border-transparent bg-warning-tint text-warning-ink',
  filled: 'border-transparent bg-primary/12 text-primary',
  cancelled: 'border-transparent bg-danger-tint text-danger-ink',
};

// application.stage has no 'sourcing' value (it starts at 'new') — map it onto the
// requisition's 4-stage track so the funnel counts below line up with STAGE_LABEL.
const APPLICANT_STAGE_INDEX: Record<string, number> = {
  new: 0,
  screening: 1,
  interview: 2,
  offer: 3,
};

// Per-stage bucket counts (FUT-558): each applicant is counted once, at their current
// stage only — moving a candidate from Sourcing to Screening decrements Sourcing and
// increments Screening. The four buckets always sum to applicantsCount. Sourcing is
// derived as the remainder (applicantsCount minus everyone who has moved past it) rather
// than counted from `applicants` directly, so the total still holds even if `applicants`
// is missing a row (e.g. an application whose candidate record didn't resolve).
export function stageCounts(
  applicantsCount: number,
  applicants: { stage: string | null }[],
): number[] {
  const counts = STAGES.map(() => 0);
  for (const a of applicants) {
    const idx = APPLICANT_STAGE_INDEX[a.stage ?? ''] ?? 0;
    if (idx > 0) counts[idx] = (counts[idx] ?? 0) + 1;
  }
  counts[0] = applicantsCount - counts.slice(1).reduce((sum, c) => sum + c, 0);
  return counts;
}

// Furthest stage any candidate has reached — drives the progress line and the checkmark
// dots (a step lights up once anyone has passed it), independent of the per-stage bucket
// counts above. -1 means no applicants at all.
export function furthestReachedIndex(applicants: { stage: string | null }[]): number {
  if (applicants.length === 0) return -1;
  return applicants.reduce((max, a) => Math.max(max, APPLICANT_STAGE_INDEX[a.stage ?? ''] ?? 0), 0);
}

export function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function daysLeft(dueDate: string): number {
  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return 0;
  return Math.ceil((due - Date.now()) / 86_400_000);
}

// RichTextEditor (Tiptap) reports an empty editor as "<p></p>", not "" — plain string
// truthiness/`.trim()` treats that as content. Strip tags before checking for real text.
export function isRichTextEmpty(html: string | null | undefined): boolean {
  if (!html) return true;
  return html.replace(/<[^>]+>/g, '').trim().length === 0;
}
