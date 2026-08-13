import type { ReqStage, ReqStatus, RequisitionListRow } from '../api/hiring-client.ts';

export const STAGES: ReqStage[] = ['sourcing', 'screening', 'interview', 'offer'];
// The requisition's OWN stage names (its first phase is "Sourcing").
export const STAGE_LABEL: Record<ReqStage, string> = {
  sourcing: 'Sourcing',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
};

// The card's pipeline buckets count candidates by their application stage, so they read in the
// candidate vocabulary — "New" (not "Sourcing") for the first phase — to match the candidate
// board and the requisition detail's applicant groups. Same 4 positions as STAGES.
export const PIPELINE_STAGE_LABEL: Record<ReqStage, string> = {
  sourcing: 'New',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
};

export const STATUS_LABEL: Record<ReqStatus, string> = {
  open: 'Open',
  on_hold: 'On hold',
  filled: 'Completed',
  cancelled: 'Cancelled',
};
export const STATUS_BADGE_CLASS: Record<ReqStatus, string> = {
  open: 'border-transparent bg-success-muted text-success',
  on_hold: 'border-transparent bg-warning-muted text-warning',
  filled: 'border-transparent bg-accent-bg/12 text-accent',
  cancelled: 'border-transparent bg-error-muted text-error',
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

// The card's attention tone: roll the risks HR cares about (blocked/approval, overdue,
// undersupplied, on-track) into ONE StatusDot colour. Priority matters — a terminal outcome
// overrides a pending approval, which overrides a live-pipeline signal. `statusWord` is the
// card's right-hand signal for NON-open lifecycle states (Filled/On hold/…); open requisitions
// return `null` there and the card shows a due-date countdown instead — a consistent,
// comparable time-to-fill signal rather than a value that means something different per card.
export interface RequisitionAttention {
  dotVariant: 'error' | 'warning' | 'success' | 'accent' | 'neutral';
  /** aria-label for the StatusDot. */
  dotLabel: string;
  /** Colour token for `statusWord`. */
  toneVar: string;
  /** Lifecycle word to show for non-open states; `null` for open (show the due date instead). */
  statusWord: string | null;
}

const TONE = {
  error: 'var(--color-text-error)',
  warning: 'var(--color-text-warning)',
  success: 'var(--color-text-success)',
  neutral: 'var(--color-text-secondary)',
} as const;

export function deriveAttention(r: RequisitionListRow): RequisitionAttention {
  if (r.status === 'cancelled')
    return {
      dotVariant: 'neutral',
      dotLabel: 'Cancelled',
      toneVar: TONE.neutral,
      statusWord: 'Cancelled',
    };
  if (r.status === 'filled')
    return {
      dotVariant: 'success',
      dotLabel: 'Completed',
      toneVar: TONE.success,
      statusWord: 'Completed',
    };
  if (r.approval_status === 'rejected')
    return {
      dotVariant: 'error',
      dotLabel: 'Rejected',
      toneVar: TONE.error,
      statusWord: 'Rejected',
    };
  if (r.approval_status === 'pending_approval')
    return {
      dotVariant: 'neutral',
      dotLabel: 'Pending approval',
      toneVar: TONE.neutral,
      statusWord: 'Pending',
    };
  if (r.status === 'on_hold')
    return {
      dotVariant: 'warning',
      dotLabel: 'On hold',
      toneVar: TONE.warning,
      statusWord: 'On hold',
    };

  // Live (open): the StatusDot tone reflects time pressure, then supply; the right-hand hero is
  // the due-date countdown (statusWord null), so the dot carries the "needs attention" signal.
  const dl = r.due_date ? daysLeft(r.due_date) : null;
  if (dl !== null && dl < 0)
    return { dotVariant: 'error', dotLabel: 'Overdue', toneVar: TONE.error, statusWord: null };
  if (r.applicants_count === 0)
    return {
      dotVariant: 'warning',
      dotLabel: 'No candidates',
      toneVar: TONE.warning,
      statusWord: null,
    };
  if (dl !== null && dl <= 7)
    return { dotVariant: 'warning', dotLabel: 'Due soon', toneVar: TONE.warning, statusWord: null };
  return { dotVariant: 'success', dotLabel: 'On track', toneVar: TONE.success, statusWord: null };
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
