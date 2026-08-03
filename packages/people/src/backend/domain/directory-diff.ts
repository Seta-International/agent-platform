import type { AVAILABILITY_STATUS } from '../db/schema.ts';

export type AvailabilityStatus = (typeof AVAILABILITY_STATUS)[number];

/**
 * One Entra user, already mapped out of Graph by the integrations module (FUT-842 §5.1).
 * `org_unit_id` is resolved by the caller; this module never reads the integrations schema.
 */
export interface DirectoryPerson {
  entra_oid: string;
  work_email: string;
  full_name: string;
  employee_no: string | null;
  personal_email: string | null;
  phone: string | null;
  hire_date: string | null; // ISO date
  leave_date: string | null; // ISO date
  job_title: string | null;
  employment_type: string | null;
  account_enabled: boolean;
  org_unit_id: string | null; // resolved by the caller
  photo_storage_key: string | null;
  timezone: string | null;
  work_start: string | null; // HH:MM:SS
  work_end: string | null;
  ooo_until: string | null; // ISO timestamp
  /** `null` = mailboxSettings was unavailable (Graph 403), not "the mailbox is empty". */
  auto_replies_enabled: boolean | null;
}

/** The `people.person` columns this sync compares against, as read back from Postgres. */
export interface PersonState {
  full_name: string | null;
  work_email: string | null;
  employee_no: string | null;
  personal_email: string | null;
  phone: string | null;
  org_unit_id: string | null;
  photo_storage_key: string | null;
  original_hire_date: string | null;
  availability_status: AvailabilityStatus;
  ooo_until: Date | null;
  timezone: string | null;
  work_start: string | null;
  work_end: string | null;
}

/** The open (`end_date IS NULL`) employment period, or `null` when the person has none. */
export interface EmploymentPeriodState {
  job_title: string | null;
  employment_type: string | null;
  start_date: string | null;
}

export interface DirectoryUpdatePlan {
  /** Changed `person` columns only — empty means nothing to write. */
  person: Record<string, string | Date | boolean | null>;
  /** Changed open-`employment_period` columns only. */
  period: Record<string, string | null>;
}

/** Entra emails are case-insensitive; `person.work_email` is stored lowercased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Postgres `time` renders as `HH:MM:SS`; Graph working hours may omit the seconds. */
export function normalizeTime(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return /^\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : trimmed;
}

/** Postgres `date` renders as `YYYY-MM-DD`; Graph hands us a full ISO timestamp. */
export function normalizeDate(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, 10);
}

function sameInstant(current: Date | null, incoming: string | null): boolean {
  if (incoming == null) return current == null;
  if (current == null) return false;
  const parsed = new Date(incoming);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() === current.getTime();
}

/**
 * Diff one Entra user against the person we already hold and return **only** what changed.
 * An empty plan is what makes a replayed sync report `unchanged` instead of churning rows.
 *
 * Two write policies, deliberately different:
 * - *Asserted*: M365 owns the field, so Entra's value wins outright — including `null`, which
 *   erases. `full_name`/`work_email`/`employee_no` are locked against manual edits too
 *   (`edit-worker` refuses them, see `field-rules.ts`). `photo_storage_key` joins this group
 *   (FUT-842) without that lock — there is no manual photo-edit path to guard against — but the
 *   same "null wins" rule: a `null` reaching here always means the photo was genuinely removed
 *   from Entra. That is only true because the CALLER resolves Graph's "unchanged" vs "no photo"
 *   facts before calling this function — see `mapGraphUser`'s `MapGraphUserExtras.photo` doc
 *   comment in `@seta/integrations`. An unchanged photo must arrive here as its current key,
 *   never `null`, or every unchanged photo in the company erases on the next sync.
 * - *Asserted when present*: Entra may simply not carry the field. A missing value means
 *   "nothing to say", never "delete what the admin or the employee curated".
 */
export function planDirectoryUpdate(
  incoming: DirectoryPerson,
  current: PersonState,
  period: EmploymentPeriodState | null,
): DirectoryUpdatePlan {
  const person: DirectoryUpdatePlan['person'] = {};
  const put = (column: string, currentValue: unknown, next: string | Date | null): void => {
    if (currentValue !== next) person[column] = next;
  };

  // Asserted — M365-owned (see field-rules.ts).
  put('full_name', current.full_name, incoming.full_name);
  put('work_email', current.work_email, normalizeEmail(incoming.work_email));
  put('employee_no', current.employee_no, incoming.employee_no);
  // Asserted (FUT-842) — moved out of "asserted when present"; see the policy comment above.
  put('photo_storage_key', current.photo_storage_key, incoming.photo_storage_key);

  // Asserted when present.
  if (incoming.personal_email != null)
    put('personal_email', current.personal_email, normalizeEmail(incoming.personal_email));
  if (incoming.phone != null) put('phone', current.phone, incoming.phone);
  if (incoming.org_unit_id != null) put('org_unit_id', current.org_unit_id, incoming.org_unit_id);
  if (incoming.hire_date != null)
    put('original_hire_date', current.original_hire_date, normalizeDate(incoming.hire_date));

  // Mailbox block. `auto_replies_enabled === null` means Graph refused mailboxSettings for this
  // user, so every column sourced from it stays exactly as it is — nulling would look like
  // "this person has no working hours" when we simply could not read them.
  if (incoming.auto_replies_enabled !== null) {
    if (incoming.timezone != null) put('timezone', current.timezone, incoming.timezone);
    put('work_start', current.work_start, normalizeTime(incoming.work_start));
    put('work_end', current.work_end, normalizeTime(incoming.work_end));

    if (incoming.auto_replies_enabled) {
      if (current.availability_status !== 'ooo') person.availability_status = 'ooo';
      if (!sameInstant(current.ooo_until, incoming.ooo_until)) {
        person.ooo_until = incoming.ooo_until == null ? null : new Date(incoming.ooo_until);
      }
    } else if (current.availability_status === 'ooo') {
      // Only the ooo ↔ available pair is M365-driven. A manually set `busy` has no Graph
      // equivalent and is never overwritten.
      person.availability_status = 'available';
      if (current.ooo_until !== null) person.ooo_until = null;
    }
  }

  const periodPlan: DirectoryUpdatePlan['period'] = {};
  if (period) {
    if (period.job_title !== incoming.job_title) periodPlan.job_title = incoming.job_title;
    if (period.employment_type !== incoming.employment_type)
      periodPlan.employment_type = incoming.employment_type;
    const startDate = normalizeDate(incoming.hire_date);
    if (startDate != null && period.start_date !== startDate) periodPlan.start_date = startDate;
    // Closing the period is one-way: a leave date that disappears from Entra does not reopen
    // employment, and `accountEnabled = false` never closes it (design §8.3 — offboarding stays
    // a human decision, raised as a `user_removed` conflict by the caller).
    const endDate = normalizeDate(incoming.leave_date);
    if (endDate != null) periodPlan.end_date = endDate;
  }

  return { person, period: periodPlan };
}

export function planIsEmpty(plan: DirectoryUpdatePlan): boolean {
  return Object.keys(plan.person).length === 0 && Object.keys(plan.period).length === 0;
}
