// Types, labels, and pure helpers for the Interviews agenda — backed by the real
// hiring.interview lifecycle (FUT-487, packages/hiring/src/backend/domain/interviews.ts).

export type InterviewRound = 'screening' | 'technical' | 'culture_fit' | 'final';
export type InterviewMode = 'online' | 'onsite';
export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export type InterviewResult = 'pass' | 'hold' | 'fail';
export type InterviewRecommendation = 'hire' | 'next_round' | 'no_hire';

export interface InterviewPanelist {
  user_id: string;
  display_name: string;
}

export interface Interview {
  id: string;
  application_id: string;
  candidate_id: string;
  candidate_name: string;
  requisition_title: string;
  round: InterviewRound;
  scheduled_at: string; // ISO datetime
  duration_minutes: number;
  mode: InterviewMode;
  meeting_link: string | null;
  panel: InterviewPanelist[];
  note: string | null;
  status: InterviewStatus;
  result?: InterviewResult | null;
  rating?: number | null;
  recommendation?: InterviewRecommendation | null;
  feedback_note?: string | null;
  outcome_reason?: string | null;
  version: number;
}

export const ROUND_OPTIONS: InterviewRound[] = ['screening', 'technical', 'culture_fit', 'final'];
export const ROUND_LABEL: Record<InterviewRound, string> = {
  screening: 'Screening',
  technical: 'Technical',
  culture_fit: 'Culture fit',
  final: 'Final',
};
export const DURATION_OPTIONS = [30, 45, 60, 90] as const;

export const STATUS_LABEL: Record<InterviewStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export const RESULT_LABEL: Record<InterviewResult, string> = {
  pass: 'Pass',
  hold: 'Hold',
  fail: 'Fail',
};
export const RESULT_BADGE_VARIANT: Record<InterviewResult, 'success' | 'warning' | 'error'> = {
  pass: 'success',
  hold: 'warning',
  fail: 'error',
};

export const RECOMMENDATION_LABEL: Record<InterviewRecommendation, string> = {
  hire: 'Hire',
  next_round: 'Next round',
  no_hire: "Don't hire",
};

// Which of an "All interviews" filter bucket an interview belongs to — mirrors the segmented
// control on the page (Upcoming = still needs an outcome; Completed = the record is closed).
export function isUpcoming(i: Interview): boolean {
  return i.status === 'scheduled';
}

export type DayBucketKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

export const DAY_BUCKET_ORDER: DayBucketKey[] = ['overdue', 'today', 'tomorrow', 'week', 'later'];
export const DAY_BUCKET_LABEL: Record<DayBucketKey, string> = {
  overdue: 'Needs an outcome',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
};
// Buckets spanning several calendar days need the date printed on every row; "today"/"tomorrow"
// already say the day in the header, so the row only has to carry the time.
export const DAY_BUCKET_SHOWS_DATE: Record<DayBucketKey, boolean> = {
  overdue: true,
  today: false,
  tomorrow: false,
  week: true,
  later: true,
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function dayBucketOf(scheduledAt: string, now: Date): DayBucketKey {
  const d = new Date(scheduledAt);
  const diffDays = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays <= 6) return 'week';
  return 'later';
}

export interface DayGroup {
  key: DayBucketKey;
  label: string;
  showsDate: boolean;
  items: Interview[];
}

// Buckets scheduled interviews into the agenda's day groups, soonest first within each bucket.
export function groupByDay(items: Interview[], now: Date): DayGroup[] {
  const buckets = new Map<DayBucketKey, Interview[]>();
  for (const i of items) {
    const key = dayBucketOf(i.scheduled_at, now);
    const list = buckets.get(key) ?? [];
    list.push(i);
    buckets.set(key, list);
  }
  return DAY_BUCKET_ORDER.filter((k) => buckets.has(k)).map((key) => ({
    key,
    label: DAY_BUCKET_LABEL[key],
    showsDate: DAY_BUCKET_SHOWS_DATE[key],
    items: (buckets.get(key) ?? []).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
  }));
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatDayAndTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${formatTime(iso)}`;
}

export function toIsoDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}
