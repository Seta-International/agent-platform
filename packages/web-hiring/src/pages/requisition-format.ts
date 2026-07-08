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

// Cumulative "reached at least this stage" counts (a funnel, not a per-stage bucket —
// applications only move forward, so an applicant currently in Interview also counts
// toward Sourcing and Screening). Sourcing is pinned to the real applicants_count
// aggregate so it always matches the header/footer total.
export function funnelCounts(
  applicantsCount: number,
  applicants: { stage: string | null }[],
): number[] {
  return STAGES.map((_, i) => {
    if (i === 0) return applicantsCount;
    return applicants.filter((a) => (APPLICANT_STAGE_INDEX[a.stage ?? ''] ?? 0) >= i).length;
  });
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
