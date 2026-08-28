import { z } from 'zod';

export const genderValue = z.enum(['male', 'female', 'prefer_not_to_say']);
export type GenderValue = z.infer<typeof genderValue>;
export const GENDER_VALUES = genderValue.options;

export const provisionWorkerInput = z.object({
  full_name: z.string().min(1),
  start_date: z.string(),
  employment_type: z.string(),
});
export type ProvisionWorkerInput = z.infer<typeof provisionWorkerInput>;

export const createWorkerInput = z.object({
  full_name: z.string().min(1),
  employee_no: z.string().optional(),
  work_email: z.string().email().optional(),
  personal_email: z.string().email().optional(),
  start_date: z.string().optional(),
  employment_type: z.string().optional(),
  dob: z.string().optional(),
  gender: genderValue.optional(),
  phone: z.string().optional(),
  emergency_contact: z.unknown().optional(),
  job_title: z.string().optional(),
  org_unit_id: z.string().uuid().optional(),
});
export type CreateWorkerInput = z.infer<typeof createWorkerInput>;

export const editWorkerPatch = z.object({
  full_name: z.string().min(1).optional(),
  work_email: z.string().email().optional(),
  personal_email: z.string().email().nullable().optional(),
  cv_storage_key: z.string().min(1).nullable().optional(),
  phone: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
  gender: genderValue.nullable().optional(),
  emergency_contact: z.unknown().optional(),
  job_title: z.string().nullable().optional(),
  org_unit_id: z.string().uuid().nullable().optional(),
  employee_no: z.string().nullable().optional(),
});
export const editWorkerInput = z.object({
  worker_id: z.string().uuid(),
  expected_version: z.number().int().positive().optional(),
  patch: editWorkerPatch,
});
export type EditWorkerInput = z.infer<typeof editWorkerInput>;

export const orgUnitKind = z.enum(['executive', 'operation', 'function', 'delivery', 'pmo']);
export type OrgUnitKind = z.infer<typeof orgUnitKind>;

export const createOrgUnitInput = z.object({
  name: z.string().min(1),
  kind: orgUnitKind,
  parent_id: z.string().uuid().nullable().optional(),
  head_worker_id: z.string().uuid().nullable().optional(),
  sort: z.number().int().optional(),
});
export type CreateOrgUnitInput = z.infer<typeof createOrgUnitInput>;

export const updateOrgUnitPatch = z.object({
  name: z.string().min(1).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  head_worker_id: z.string().uuid().nullable().optional(),
});
export type UpdateOrgUnitPatch = z.infer<typeof updateOrgUnitPatch>;

export const updateOrgUnitInput = z.object({
  org_unit_id: z.string().uuid(),
  patch: updateOrgUnitPatch,
});

export const deleteOrgUnitInput = z.object({
  org_unit_id: z.string().uuid(),
});

export const performanceContextInput = z.object({
  as_of_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), // YYYY-MM
});
export type PerformanceContextInput = z.infer<typeof performanceContextInput>;

const monthYm = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const cycleStatusQuery = z.object({
  month: monthYm,
  /** Account in view — a manual unlock (FUT-781) is scoped to one account. */
  account_id: z.string().uuid().nullish(),
});
export type CycleStatusQuery = z.infer<typeof cycleStatusQuery>;

export const cycleStatusEnum = z.enum(['open', 'makeup', 'locked', 'override']);
export type CycleStatus = z.infer<typeof cycleStatusEnum>;

export const cycleStatusResponse = z.object({
  month: monthYm,
  status: cycleStatusEnum,
  /** UTC ISO of the transaction-start timestamp used for classification. */
  evaluated_at: z.string().datetime(),
});
export type CycleStatusResponse = z.infer<typeof cycleStatusResponse>;

// --- Manual cycle unlock (FUT-781) ---------------------------------------

export const unlockAction = z.enum(['unlock', 'relock']);
export type UnlockAction = z.infer<typeof unlockAction>;

/** A manual unlock may reopen an account's cycle for at most this many days. */
export const UNLOCK_MAX_DAYS = 5;

/** PMO reopens one account's review month for a bounded number of days. */
export const cycleUnlockInput = z.object({
  month: monthYm,
  account_id: z.string().uuid(),
  days: z.number().int().min(1).max(UNLOCK_MAX_DAYS),
});
export type CycleUnlockInput = z.infer<typeof cycleUnlockInput>;

/** PMO closes an account's window before it expires on its own. */
export const cycleRelockInput = z.object({
  month: monthYm,
  account_id: z.string().uuid(),
});
export type CycleRelockInput = z.infer<typeof cycleRelockInput>;

export const cycleUnlockEntry = z.object({
  id: z.string().uuid(),
  review_month: monthYm,
  account_id: z.string().uuid(),
  action: unlockAction,
  /** When the window closes; null on re-lock rows (effective immediately). */
  expires_at: z.string().datetime().nullable(),
  actor_person_id: z.string().uuid().nullable(),
  actor_user_id: z.string().uuid(),
  created_at: z.string().datetime(),
});
export type CycleUnlockEntry = z.infer<typeof cycleUnlockEntry>;

export const cycleUnlockAccountState = z.object({
  account_id: z.string().uuid(),
  name: z.string(),
  /** ISO deadline of the running unlock, or null when the account is locked. */
  unlocked_until: z.string().datetime().nullable(),
});
export type CycleUnlockAccountState = z.infer<typeof cycleUnlockAccountState>;

/**
 * Everything the PMO unlock panel needs: the one month that may be unlocked right
 * now (the latest closed cycle), each account's current state, and the immutable
 * trail for that month, newest first.
 */
export const cycleUnlockPanel = z.object({
  unlockable_month: monthYm,
  max_days: z.number().int(),
  accounts: z.array(cycleUnlockAccountState),
  entries: z.array(cycleUnlockEntry),
});
export type CycleUnlockPanel = z.infer<typeof cycleUnlockPanel>;

export type PerformanceCapacity =
  | { kind: 'am'; account_id: string; label: string }
  | { kind: 'tl'; project_id: string; account_id: string; label: string }
  | { kind: 'member'; project_id: string; account_id: string; label: string };

export const performanceCapacity = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('am'), account_id: z.string().uuid(), label: z.string() }),
  z.object({
    kind: z.literal('tl'),
    project_id: z.string().uuid(),
    account_id: z.string().uuid(),
    label: z.string(),
  }),
  z.object({
    kind: z.literal('member'),
    project_id: z.string().uuid(),
    account_id: z.string().uuid(),
    label: z.string(),
  }),
]);

export const monthTasksQuery = z.object({
  month: monthYm,
});
export type MonthTasksQuery = z.infer<typeof monthTasksQuery>;

/** Server-authored home to-do cards (FUT-695) — FE echoes only. */
export const monthTaskCard = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unscored'),
    unscored: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    interactive: z.boolean(),
  }),
  z.object({
    kind: z.literal('self_assessment'),
    submitted: z.boolean(),
    interactive: z.boolean(),
  }),
  z.object({
    kind: z.literal('morale'),
    submitted: z.boolean(),
    interactive: z.boolean(),
  }),
  z.object({
    kind: z.literal('cycle_locked'),
  }),
]);
export type MonthTaskCard = z.infer<typeof monthTaskCard>;

export const monthTaskGroup = z.object({
  capacity: performanceCapacity,
  label: z.string(),
  cards: z.array(monthTaskCard),
});
export type MonthTaskGroup = z.infer<typeof monthTaskGroup>;

export const monthTasksResponse = z.object({
  month: monthYm,
  cycle_status: cycleStatusEnum,
  groups: z.array(monthTaskGroup),
});
export type MonthTasksResponse = z.infer<typeof monthTasksResponse>;

/**
 * The Performance surface's entry context ("EmployeePort" read). Discriminated
 * on `status`: `no_employee_record` is a first-class state (renders the
 * "Contact HR" block screen), never a 403/404.
 */
export type PerformanceContext =
  | { status: 'no_employee_record' }
  | {
      status: 'ok';
      as_of_month: string;
      person: { person_id: string; full_name: string | null; org_unit_id: string | null };
      /** Session RBAC role slugs (pm.pmo, pm.bod, people.manager, …) for SCR-02 routing. */
      role_slugs: string[];
      /** Sorted: am < tl < member, then label asc, then id asc — deterministic (AC4). */
      capacities: PerformanceCapacity[];
      default_capacity_index: 0 | -1;
      /**
       * True iff the session holds `people.performance.read_org` — gates the explicit
       * "Organization" (strategic/PMO) view. Org mode is a deliberate choice, never a
       * fallback for capacity-less users (FUT-781).
       */
      can_view_org: boolean;
      /** True iff the session holds `people.performance.unlock` — gates the PMO unlock panel. */
      can_unlock: boolean;
    };

const weightPct = z.number().finite().min(0).max(100);

export const performanceConfigCriterionInput = z.object({
  name: z.string().min(1).max(200),
  weight: weightPct,
  sort: z.number().int().nonnegative().optional(),
});
export type PerformanceConfigCriterionInput = z.infer<typeof performanceConfigCriterionInput>;

export const performanceConfigGroupInput = z.object({
  group_id: z.string().uuid(),
  weight: weightPct,
  criteria: z.array(performanceConfigCriterionInput).min(1),
});
export type PerformanceConfigGroupInput = z.infer<typeof performanceConfigGroupInput>;

export const savePerformanceConfigInput = z.object({
  account_id: z.string().uuid(),
  base_revision_no: z.number().int().positive(),
  groups: z.array(performanceConfigGroupInput).min(1),
});
export type SavePerformanceConfigInput = z.infer<typeof savePerformanceConfigInput>;

export const performanceConfigCriterionView = z.object({
  id: z.string().uuid(),
  name: z.string(),
  weight: z.number(),
  sort: z.number().int(),
});
export type PerformanceConfigCriterionView = z.infer<typeof performanceConfigCriterionView>;

export const performanceConfigGroupView = z.object({
  group_id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  sort: z.number().int(),
  weight: z.number(),
  criteria: z.array(performanceConfigCriterionView),
});
export type PerformanceConfigGroupView = z.infer<typeof performanceConfigGroupView>;

export const performanceConfigResponse = z.object({
  account_id: z.string().uuid(),
  revision_no: z.number().int().positive(),
  revision_id: z.string().uuid(),
  applies_to_next_cycle: z.boolean(),
  groups: z.array(performanceConfigGroupView),
});
export type PerformanceConfigResponse = z.infer<typeof performanceConfigResponse>;

export const savePerformanceConfigResponse = z.object({
  revision_no: z.number().int().positive(),
  revision_id: z.string().uuid(),
  applies_to_next_cycle: z.boolean(),
});
export type SavePerformanceConfigResponse = z.infer<typeof savePerformanceConfigResponse>;

// ---------------------------------------------------------------------------
// Morale & Concern Notes (FUT-782)
// ---------------------------------------------------------------------------

export const moraleRecipientTag = z.enum(['hr', 'tl', 'am', 'pmo', 'bod']);
export type MoraleRecipientTag = z.infer<typeof moraleRecipientTag>;

/**
 * The sender picks named people, not roles. HR is never listed or submitted — the
 * server appends it on every note, so the client cannot drop it.
 */
export const submitMoraleInput = z.object({
  rating: z.number().int().min(1).max(5),
  concern_text: z.string().max(5000).optional(),
  /**
   * Which project the note is about. Omitted when the sender has nothing to choose —
   * one project (the server picks it) or none at all (it stays NULL). The server never
   * trusts this value: it re-derives the sender's projects and rejects anything else.
   */
  project_id: z.string().uuid().nullable().optional(),
  recipient_person_ids: z.array(z.string().uuid()),
});
export type SubmitMoraleInput = z.infer<typeof submitMoraleInput>;

export const moraleRecipientView = z.object({
  recipient_tag: moraleRecipientTag,
  full_name_snapshot: z.string().nullable(),
});
export type MoraleRecipientView = z.infer<typeof moraleRecipientView>;

export const moraleNoteView = z.object({
  id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  concern_text: z.string().nullable(),
  submitted_at: z.string(),
  /** Null for a note filed by someone on no project — an HR or BoD manager. */
  project_id: z.string().uuid().nullable(),
  /**
   * The project's name as it stood when the note was filed — the same snapshot the
   * recipients' inbox groups under, so one note never reads back under two different
   * names. Null when `project_id` is null, and on notes filed before the snapshot
   * existed.
   */
  project_name: z.string().nullable(),
  recipients: z.array(moraleRecipientView),
});
export type MoraleNoteView = z.infer<typeof moraleNoteView>;

export const moraleHistoryResponse = z.object({
  notes: z.array(moraleNoteView),
});
export type MoraleHistoryResponse = z.infer<typeof moraleHistoryResponse>;

export const moraleSelectableTag = z.enum(['tl', 'am', 'pmo', 'bod']);
export type MoraleSelectableTag = z.infer<typeof moraleSelectableTag>;

/** A selectable person. HR holders are excluded — they receive every note regardless. */
export const moraleRecipientCandidate = z.object({
  person_id: z.string().uuid(),
  full_name: z.string().nullable(),
  /** Why this person is reachable — the shared project or account, shown under the name. */
  context: z.string().nullable(),
});
export type MoraleRecipientCandidate = z.infer<typeof moraleRecipientCandidate>;

/**
 * One role the sender may route to. A group is *absent* when the role does not apply
 * to this sender at all (a TL is never offered the TL group), and *present but empty*
 * when it applies but nobody qualifies — those two states read differently in the UI,
 * so `unavailable_reason` explains the second rather than the role silently vanishing.
 */
export const moraleRecipientGroup = z.object({
  tag: moraleSelectableTag,
  candidates: z.array(moraleRecipientCandidate),
  unavailable_reason: z.string().nullable(),
});
export type MoraleRecipientGroup = z.infer<typeof moraleRecipientGroup>;

/** A project the sender is allocated to, and so may file a note against. */
export const moraleProjectOption = z.object({
  project_id: z.string().uuid(),
  name: z.string().nullable(),
});
export type MoraleProjectOption = z.infer<typeof moraleProjectOption>;

/** What the send form needs: whether this person may submit, against what, and to whom. */
export const moraleRecipientsForm = z.object({
  /**
   * False only for a login with no employee record — there is no reporting line to
   * resolve and nobody to attribute a note to. Holding no allocation is *not* a bar:
   * an HR or BoD manager still submits, reaching PMO and BoD with a NULL project.
   */
  can_submit: z.boolean(),
  /**
   * Every project the sender touches, as Member or as Team Lead. Empty for a sender
   * with no active allocation. One entry means the choice is already made; two or more
   * means the client must offer it, because TL and AM differ per project.
   */
  projects: z.array(moraleProjectOption),
  /**
   * The project `groups` below is scoped to. Resolved server-side: the only project when
   * there is exactly one, the requested one when it is genuinely the sender's, and null
   * otherwise — including the "several projects, none picked yet" state, where TL and AM
   * cannot be determined and are therefore absent from `groups`.
   */
  selected_project_id: z.string().uuid().nullable(),
  groups: z.array(moraleRecipientGroup),
});
export type MoraleRecipientsForm = z.infer<typeof moraleRecipientsForm>;

export const moraleRecipientsResponse = moraleRecipientsForm.extend({
  /**
   * Whether this caller can be a morale recipient at all — HR, PMO, BoD, an AM of an
   * account, or the lead of a project (FUT-786). Gates the Notes Received and Morale
   * Trend tabs. Carried alongside `can_submit` rather than on its own endpoint because
   * the page needs both answers before it can paint a single tab.
   */
  can_review: z.boolean(),
});
export type MoraleRecipientsResponse = z.infer<typeof moraleRecipientsResponse>;

/** Which project the recipient list should be scoped to; absent means "not chosen yet". */
export const moraleRecipientsQuery = z.object({
  project_id: z.string().uuid().optional(),
});
export type MoraleRecipientsQuery = z.infer<typeof moraleRecipientsQuery>;

/**
 * Calendar-date history window, both ends inclusive and read in Asia/Ho_Chi_Minh.
 * Dates rather than timestamps: the sender picks days on a calendar, and the server
 * owns the conversion to instants so the boundary rule lives in one place.
 */
export const moraleHistoryQuery = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type MoraleHistoryQuery = z.infer<typeof moraleHistoryQuery>;

// ---------------------------------------------------------------------------
// Morale inbox & trend, for recipients (FUT-786)
// ---------------------------------------------------------------------------

export const moraleSenderCapacity = z.enum(['member', 'tl']);
export type MoraleSenderCapacity = z.infer<typeof moraleSenderCapacity>;

export const moraleInboxQuery = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Absent = every project. The literal 'none' selects notes with no project snapshot. */
  project_id: z.union([z.string().uuid(), z.literal('none')]).optional(),
  sender_person_id: z.string().uuid().optional(),
  unread_only: z.boolean().optional(),
});
export type MoraleInboxQuery = z.infer<typeof moraleInboxQuery>;

/**
 * A note as its recipients see it.
 *
 * No `rating` field exists on purpose (AC4): the 1–5 score is never exposed to a
 * recipient, including HR, and leaving it off the contract means no handler can leak it
 * by accident. A rating submitted with no text still arrives here, with a null
 * `concern_text` — the UI says so rather than hiding the submission.
 *
 * `recipient_tags` are roles, never names: a note addressed to four PMOs shows "PMO"
 * once, so the inbox cannot be read as a directory of who else was told.
 */
export const moraleInboxNote = z.object({
  id: z.string().uuid(),
  sender_person_id: z.string().uuid(),
  sender_name: z.string().nullable(),
  sender_capacity: moraleSenderCapacity.nullable(),
  submitted_at: z.string(),
  concern_text: z.string().nullable(),
  recipient_tags: z.array(moraleRecipientTag),
  is_read: z.boolean(),
});
export type MoraleInboxNote = z.infer<typeof moraleInboxNote>;

export const moraleInboxProjectGroup = z.object({
  /** Null for senders who had no active allocation when they wrote. */
  project_id: z.string().uuid().nullable(),
  project_name: z.string(),
  total_notes: z.number().int(),
  unread_notes: z.number().int(),
  notes: z.array(moraleInboxNote),
});
export type MoraleInboxProjectGroup = z.infer<typeof moraleInboxProjectGroup>;

export const moraleInboxResponse = z.object({
  total_notes: z.number().int(),
  unread_notes: z.number().int(),
  projects: z.array(moraleInboxProjectGroup),
});
export type MoraleInboxResponse = z.infer<typeof moraleInboxResponse>;

/**
 * The option lists for the inbox's Project and Sender pickers, over the same date window
 * the list itself uses.
 *
 * Each sender carries their project so the two pickers can constrain each other in the
 * client: picking a sender narrows Project to theirs, picking a project narrows Sender to
 * the people who wrote from it. Doing that here rather than as a request per keystroke
 * keeps the two lists provably consistent with each other.
 */
export const moraleInboxSenderOption = z.object({
  person_id: z.string().uuid(),
  full_name: z.string().nullable(),
  project_id: z.string().uuid().nullable(),
});
export type MoraleInboxSenderOption = z.infer<typeof moraleInboxSenderOption>;

export const moraleInboxProjectOption = z.object({
  project_id: z.string().uuid().nullable(),
  name: z.string(),
});
export type MoraleInboxProjectOption = z.infer<typeof moraleInboxProjectOption>;

export const moraleInboxFiltersResponse = z.object({
  projects: z.array(moraleInboxProjectOption),
  senders: z.array(moraleInboxSenderOption),
});
export type MoraleInboxFiltersResponse = z.infer<typeof moraleInboxFiltersResponse>;

/** `YYYY-MM`, Asia/Ho_Chi_Minh — the same period key the anonymous store is written with. */
export const moraleMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const moraleTrendQuery = z.object({
  from_month: moraleMonth.optional(),
  to_month: moraleMonth.optional(),
});
export type MoraleTrendQuery = z.infer<typeof moraleTrendQuery>;

/**
 * One month of the anonymous trend.
 *
 * `average` is null exactly when `responses` is under the anonymity threshold: the count
 * still travels so the chart can say *why* a month is blank instead of leaving a silent
 * gap, but the score itself never leaves the server for a group that small.
 */
export const moraleTrendPoint = z.object({
  period: moraleMonth,
  responses: z.number().int(),
  average: z.number().nullable(),
});
export type MoraleTrendPoint = z.infer<typeof moraleTrendPoint>;

export const moraleTrendResponse = z.object({
  from_month: moraleMonth,
  to_month: moraleMonth,
  /** Smallest group the trend will show a score for. */
  min_responses: z.number().int(),
  /** Every response in the window, hidden months included. */
  total_responses: z.number().int(),
  points: z.array(moraleTrendPoint),
});
export type MoraleTrendResponse = z.infer<typeof moraleTrendResponse>;
