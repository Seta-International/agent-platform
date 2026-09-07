import { textEnum, textEnumCheck, textEnumValuesSql } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const peopleSchema = pgSchema('people');

export const LIFECYCLE_STAGES = [
  'preboarding',
  'onboarding',
  'probation',
  'active',
  'on_leave',
  'offboarding',
  'alumni',
  'did_not_start',
] as const;

export const AVAILABILITY_STATUS = ['available', 'busy', 'ooo'] as const;

export const ORG_UNIT_KINDS = ['executive', 'operation', 'function', 'delivery', 'pmo'] as const;

export const GENDERS = ['male', 'female', 'prefer_not_to_say'] as const;

export const PROJECTION_BUCKETS = ['billable', 'internal', 'bench'] as const;

export const person = peopleSchema.table(
  'person',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    bio: text('bio'),
    original_hire_date: date('original_hire_date'),
    seniority_date: date('seniority_date'),
    employee_no: text('employee_no'),
    full_name: text('full_name'),
    work_email: text('work_email'),
    personal_email: text('personal_email'),
    dob: date('dob'),
    gender: textEnum('gender', GENDERS),
    phone: text('phone'),
    emergency_contact: jsonb('emergency_contact'),
    profile_completed_at: timestamp('profile_completed_at', { withTimezone: true }),
    cv_storage_key: text('cv_storage_key'),
    // M365 directory sync (FUT-842). photo_storage_key mirrors cv_storage_key: an S3 key
    // via @seta/shared-storage, not a URL. directory_managed drives the field lock in
    // editWorker — people cannot read the integrations link table across the schema boundary.
    photo_storage_key: text('photo_storage_key'),
    directory_managed: boolean('directory_managed').default(false).notNull(),
    // Lazy column-level reference (not table-level foreignKey()): org_unit is
    // declared after person below, so a table-level foreignKey() would evaluate
    // `orgUnit` eagerly and hit the TDZ.
    org_unit_id: uuid('org_unit_id').references((): AnyPgColumn => orgUnit.id),
    availability_status: textEnum('availability_status', AVAILABILITY_STATUS)
      .default('available')
      .notNull(),
    ooo_until: timestamp('ooo_until', { withTimezone: true }),
    work_start: time('work_start'),
    work_end: time('work_end'),
    timezone: text('timezone').default('UTC').notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('person_uniq_employee_no_per_tenant')
      .on(t.tenant_id, t.employee_no)
      .where(sql`employee_no IS NOT NULL AND deleted_at IS NULL`),
    uniqueIndex('person_uniq_email_per_tenant')
      .on(t.tenant_id, t.work_email)
      .where(sql`work_email IS NOT NULL AND deleted_at IS NULL`),
    index('person_by_tenant_live').on(t.tenant_id).where(sql`deleted_at IS NULL`),
    index('person_by_org_unit').on(t.tenant_id, t.org_unit_id),
    textEnumCheck('person', 'gender', GENDERS),
    textEnumCheck('person', 'availability_status', AVAILABILITY_STATUS),
  ],
);

export const employmentPeriod = peopleSchema.table(
  'employment_period',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    person_id: uuid('person_id').notNull(),
    seq: integer('seq').notNull(),
    start_date: date('start_date'),
    end_date: date('end_date'),
    lifecycle_stage: textEnum('lifecycle_stage', LIFECYCLE_STAGES).notNull().default('preboarding'),
    employment_type: text('employment_type'),
    job_title: text('job_title'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('employment_period_uniq_seq').on(t.tenant_id, t.person_id, t.seq),
    uniqueIndex('employment_period_one_open').on(t.person_id).where(sql`end_date IS NULL`),
    index('employment_period_by_person').on(t.tenant_id, t.person_id),
    foreignKey({
      columns: [t.person_id],
      foreignColumns: [person.id],
      name: 'employment_period_person_fk',
    }),
    textEnumCheck('employment_period', 'lifecycle_stage', LIFECYCLE_STAGES),
  ],
);

export const orgUnit = peopleSchema.table(
  'org_unit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    parent_id: uuid('parent_id'),
    name: text('name').notNull(),
    kind: textEnum('kind', ORG_UNIT_KINDS).notNull(),
    // Keyed on person_id (the domain's canonical worker handle, as returned by
    // createWorker/insertWorkerAggregate), not worker.id.
    head_worker_id: uuid('head_worker_id'),
    sort: integer('sort').notNull().default(0),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('org_unit_by_parent').on(t.tenant_id, t.parent_id),
    index('org_unit_by_head').on(t.tenant_id, t.head_worker_id),
    foreignKey({
      columns: [t.parent_id],
      foreignColumns: [t.id],
      name: 'org_unit_parent_fk',
    }),
    foreignKey({
      columns: [t.head_worker_id],
      foreignColumns: [person.id],
      name: 'org_unit_head_worker_fk',
    }).onDelete('set null'),
    textEnumCheck('org_unit', 'kind', ORG_UNIT_KINDS),
  ],
);

export const personSkill = peopleSchema.table(
  'person_skill',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    person_id: uuid('person_id').notNull(),
    skill_id: uuid('skill_id').notNull(),
    skill_name: text('skill_name').notNull(),
    level: integer('level'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('person_skill_uniq').on(t.tenant_id, t.person_id, t.skill_id),
    index('person_skill_by_person').on(t.tenant_id, t.person_id),
    index('person_skill_by_skill').on(t.tenant_id, t.skill_id),
    foreignKey({
      columns: [t.person_id],
      foreignColumns: [person.id],
      name: 'person_skill_person_fk',
    }),
    check('person_skill_level_check', sql`level BETWEEN 0 AND 5`),
  ],
);

export const personHistory = peopleSchema.table(
  'person_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    person_id: uuid('person_id').notNull(),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
    action: text('action').notNull(),
    field: text('field'),
    from_val: jsonb('from_val'),
    to_val: jsonb('to_val'),
    by_user_id: uuid('by_user_id'),
  },
  (t) => [
    index('person_history_by_person').on(t.tenant_id, t.person_id, t.at),
    foreignKey({
      columns: [t.person_id],
      foreignColumns: [person.id],
      name: 'person_history_person_fk',
    }).onDelete('cascade'),
  ],
);

export const workerAllocationProjection = peopleSchema.table(
  'worker_allocation_projection',
  {
    allocation_id: uuid('allocation_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    person_id: uuid('person_id'),
    project_id: uuid('project_id').notNull(),
    account_id: uuid('account_id').notNull(),
    lead_person_id: uuid('lead_person_id'),
    date_from: date('date_from'),
    date_to: date('date_to'),
    planned_pct: numeric('planned_pct', { precision: 10, scale: 4 }),
    bucket: text('bucket'),
    active: boolean('active').notNull().default(true),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('worker_alloc_by_person').on(t.tenant_id, t.person_id),
    index('worker_alloc_by_account').on(t.tenant_id, t.account_id),
    index('worker_alloc_by_project').on(t.tenant_id, t.project_id),
    check(
      'worker_alloc_bucket_check',
      sql.raw(`bucket IS NULL OR bucket IN (${textEnumValuesSql(PROJECTION_BUCKETS)})`),
    ),
  ],
);

export const accountProjection = peopleSchema.table('account_projection', {
  account_id: uuid('account_id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projectProjection = peopleSchema.table(
  'project_projection',
  {
    project_id: uuid('project_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    account_id: uuid('account_id').notNull(),
    name: text('name').notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('project_proj_by_account').on(t.tenant_id, t.account_id)],
);

export const userProjection = peopleSchema.table(
  'user_projection',
  {
    user_id: uuid('user_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    person_id: uuid('person_id').notNull(),
    deactivated_at: timestamp('deactivated_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('user_projection_uniq_person').on(t.tenant_id, t.person_id)],
);

export const MORALE_RECIPIENT_TAGS = ['hr', 'tl', 'am', 'pmo', 'bod'] as const;

/** Which side of the project the sender wrote from — a lead's note reads differently. */
export const MORALE_SENDER_CAPACITIES = ['member', 'tl'] as const;

/**
 * Append-only morale note per submission (FUT-782). Scoped to the person, not to a
 * project: a note is about how someone feels, and they may sit on several projects.
 */
export const moraleNote = peopleSchema.table(
  'morale_note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    person_id: uuid('person_id')
      .notNull()
      .references(() => person.id),
    /** Sender's org unit frozen at submit time, so a later transfer can't rewrite history. */
    org_unit_id: uuid('org_unit_id'),
    rating: integer('rating').notNull(),
    concern_text: text('concern_text'),
    submitted_at: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    /**
     * Sender's delivery context frozen at submit time, so the recipients' inbox can group
     * by project without re-filing old notes when someone changes team (FUT-786). Which
     * project it is comes from the sender: the only one they hold when there is one, and
     * their own pick when there are several (FUT-782). Null on notes written before
     * FUT-786, and on a sender with no active allocation at all.
     */
    project_id: uuid('project_id'),
    project_name_snapshot: text('project_name_snapshot'),
    account_id: uuid('account_id'),
    sender_capacity: textEnum('sender_capacity', MORALE_SENDER_CAPACITIES),
  },
  (t) => [
    index('morale_note_by_person').on(t.tenant_id, t.person_id, t.submitted_at),
    index('morale_note_by_project').on(t.tenant_id, t.project_id, t.submitted_at),
    check('morale_note_rating_range', sql`rating >= 1 AND rating <= 5`),
    textEnumCheck('morale_note', 'sender_capacity', MORALE_SENDER_CAPACITIES),
  ],
);

/** Snapshot of resolved recipients at submission time (FUT-782). */
export const moraleNoteRecipient = peopleSchema.table(
  'morale_note_recipient',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    note_id: uuid('note_id')
      .notNull()
      .references(() => moraleNote.id, { onDelete: 'cascade' }),
    recipient_person_id: uuid('recipient_person_id').notNull(),
    recipient_tag: textEnum('recipient_tag', MORALE_RECIPIENT_TAGS).notNull(),
    full_name_snapshot: text('full_name_snapshot'),
  },
  (t) => [
    index('morale_recipient_by_note').on(t.note_id),
    index('morale_recipient_by_person').on(t.recipient_person_id),
    textEnumCheck('morale_note_recipient', 'recipient_tag', MORALE_RECIPIENT_TAGS),
  ],
);

/**
 * Read state per recipient (FUT-786), not per note. HR sits on every note, so a single
 * flag on the note would let HR clear the unread badge for a Team Lead who never opened
 * it. Absence of a row is "unread" — nothing to backfill for notes that predate this.
 */
export const moraleNoteRead = peopleSchema.table(
  'morale_note_read',
  {
    note_id: uuid('note_id')
      .notNull()
      .references(() => moraleNote.id, { onDelete: 'cascade' }),
    reader_person_id: uuid('reader_person_id').notNull(),
    read_at: timestamp('read_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.note_id, t.reader_person_id] }),
    index('morale_note_read_by_reader').on(t.reader_person_id),
  ],
);

/**
 * Ratings split off the note so morale trends can be read without touching an
 * identifiable row (AC4). Deliberately carries no person_id, no note_id, and no
 * timestamp finer than the month — a precise `recorded_at` would let anyone with
 * both tables correlate a rating back to its author.
 */
export const moraleRatingAggregate = peopleSchema.table(
  'morale_rating_aggregate',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    org_unit_id: uuid('org_unit_id'),
    /** Submission month, `YYYY-MM` in Asia/Ho_Chi_Minh. */
    period: text('period').notNull(),
    rating: integer('rating').notNull(),
    /**
     * Delivery dimensions (FUT-786) so a Team Lead or Account Manager can be shown the
     * scope they are entitled to without the trend ever reading an identifiable row.
     * What this changes is how coarsely a rating can be grouped, not whether it can be
     * traced — the minimum-responses rule is what keeps a small project unreadable.
     */
    project_id: uuid('project_id'),
    account_id: uuid('account_id'),
  },
  (t) => [
    index('morale_rating_by_period').on(t.tenant_id, t.period),
    index('morale_rating_by_org_unit').on(t.tenant_id, t.org_unit_id, t.period),
    index('morale_rating_by_project').on(t.tenant_id, t.project_id, t.period),
    index('morale_rating_by_account').on(t.tenant_id, t.account_id, t.period),
    check('morale_rating_aggregate_range', sql`rating >= 1 AND rating <= 5`),
    check('morale_rating_aggregate_period', sql`period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

/** Fixed evaluation pillars per tenant — AM configures weights, never names/count (FUT-778). */
export const performanceEvaluationGroup = peopleSchema.table(
  'performance_evaluation_group',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    sort: integer('sort').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('perf_eval_group_uniq_code').on(t.tenant_id, t.code)],
);

/** Append-only config snapshot per AM Save (AC8). */
export const performanceConfigRevision = peopleSchema.table(
  'performance_config_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    account_id: uuid('account_id').notNull(),
    revision_no: integer('revision_no').notNull(),
    created_by_user_id: uuid('created_by_user_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('perf_config_rev_uniq').on(t.tenant_id, t.account_id, t.revision_no),
    index('perf_config_rev_by_account').on(t.tenant_id, t.account_id),
  ],
);

export const performanceConfigGroupWeight = peopleSchema.table(
  'performance_config_group_weight',
  {
    revision_id: uuid('revision_id')
      .notNull()
      .references(() => performanceConfigRevision.id, { onDelete: 'cascade' }),
    group_id: uuid('group_id')
      .notNull()
      .references(() => performanceEvaluationGroup.id),
    weight: numeric('weight', { precision: 5, scale: 2 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.revision_id, t.group_id] }),
    check('perf_config_group_weight_range', sql`weight >= 0 AND weight <= 100`),
  ],
);

export const performanceConfigCriterion = peopleSchema.table(
  'performance_config_criterion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    revision_id: uuid('revision_id')
      .notNull()
      .references(() => performanceConfigRevision.id, { onDelete: 'cascade' }),
    group_id: uuid('group_id')
      .notNull()
      .references(() => performanceEvaluationGroup.id),
    name: text('name').notNull(),
    weight: numeric('weight', { precision: 5, scale: 2 }).notNull(),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    uniqueIndex('perf_config_criterion_uniq_name').on(t.revision_id, t.group_id, t.name),
    index('perf_config_criterion_by_rev').on(t.revision_id, t.group_id),
    check('perf_config_criterion_weight_range', sql`weight >= 0 AND weight <= 100`),
  ],
);

/** Frozen revision for a review month (AC5) — Saves after pin do not move this. */
export const performanceConfigMonthPin = peopleSchema.table(
  'performance_config_month_pin',
  {
    tenant_id: uuid('tenant_id').notNull(),
    account_id: uuid('account_id').notNull(),
    review_month: text('review_month').notNull(),
    revision_id: uuid('revision_id')
      .notNull()
      .references(() => performanceConfigRevision.id),
    pinned_at: timestamp('pinned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.account_id, t.review_month] }),
    check('perf_config_month_pin_ym', sql`review_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

export const EVALUATION_STATUSES = ['draft', 'submitted'] as const;
/**
 * Who is doing the scoring: a TL scores project members, an AM scores TLs, and a member
 * scores themselves (FUT-779). Only members self-assess — a lead's own review is the
 * AM's to write.
 */
export const EVALUATOR_CAPACITIES = ['tl', 'am', 'self'] as const;
/** Criterion scores run this scale in half points — 1, 1.5, … 5 (FUT-784 AC2). */
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

/**
 * One evaluation of one person, on one project, for one review month — at most one from
 * their manager and at most one from themselves (the unique indexes are the guarantee,
 * not a convention). Both are scored against the same criteria so the two views compare;
 * only the manager's feeds the official roll-ups (FUT-779 AC3).
 *
 * `revision_id` freezes the account config the evaluation was scored against, so a
 * closed month always renders the criteria and weights that were in force at the time
 * (AC7) even after the AM reconfigures. `overall` is written by the server on submit
 * and is NULL while the evaluation is a draft — the UI shows "—", never 0 (AC5).
 * `version` is the optimistic lock behind the two-tab guard (AC8).
 */
export const performanceEvaluation = peopleSchema.table(
  'performance_evaluation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    review_month: text('review_month').notNull(),
    subject_person_id: uuid('subject_person_id').notNull(),
    project_id: uuid('project_id').notNull(),
    /** Denormalized from the project so account/company roll-ups need no join. */
    account_id: uuid('account_id').notNull(),
    evaluator_person_id: uuid('evaluator_person_id').notNull(),
    evaluator_capacity: textEnum('evaluator_capacity', EVALUATOR_CAPACITIES).notNull(),
    revision_id: uuid('revision_id')
      .notNull()
      .references(() => performanceConfigRevision.id),
    status: textEnum('status', EVALUATION_STATUSES).notNull().default('draft'),
    overall: numeric('overall', { precision: 3, scale: 2 }),
    strengths: text('strengths').notNull().default(''),
    improve: text('improve').notNull().default(''),
    top_action: text('top_action').notNull().default(''),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Two rows may exist per (subject, project, month) and no more: the manager's review
    // and the subject's own. Split as partial indexes rather than adding capacity to one
    // key, so a lead change mid-cycle can flip a review from `tl` to `am` without ever
    // opening room for a second manager row.
    uniqueIndex('perf_eval_uniq_manager_review')
      .on(t.tenant_id, t.review_month, t.subject_person_id, t.project_id)
      .where(sql`subject_person_id <> evaluator_person_id`),
    uniqueIndex('perf_eval_uniq_self_assessment')
      .on(t.tenant_id, t.review_month, t.subject_person_id, t.project_id)
      .where(sql`subject_person_id = evaluator_person_id`),
    index('perf_eval_by_account_month').on(t.tenant_id, t.account_id, t.review_month),
    index('perf_eval_by_evaluator').on(t.tenant_id, t.evaluator_person_id, t.review_month),
    textEnumCheck('performance_evaluation', 'status', EVALUATION_STATUSES),
    textEnumCheck('performance_evaluation', 'evaluator_capacity', EVALUATOR_CAPACITIES),
    check('perf_eval_ym', sql`review_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    // `self` is exactly the capacity in which someone writes about themselves — a manager
    // review can never be self-addressed (FUT-784 AC8), and a self-assessment can never be
    // filed under a manager capacity where the roll-ups would count it (FUT-779 AC3).
    check(
      'perf_eval_self_capacity',
      sql`(evaluator_capacity = 'self') = (subject_person_id = evaluator_person_id)`,
    ),
    // The official score exists exactly when the evaluation has been submitted (AC5).
    check(
      'perf_eval_overall_on_submit',
      sql`(status = 'submitted') = (overall IS NOT NULL AND submitted_at IS NOT NULL)`,
    ),
    check('perf_eval_overall_range', sql`overall IS NULL OR (overall >= 1 AND overall <= 5)`),
  ],
);

/**
 * One score per criterion of the evaluation's frozen revision. A criterion with no row
 * is simply unscored, which is how a draft in progress looks.
 *
 * `evidence` is no longer collected by the form; the column stays so notes written before
 * that survive, and so a write never has to blank them.
 */
export const performanceEvaluationScore = peopleSchema.table(
  'performance_evaluation_score',
  {
    tenant_id: uuid('tenant_id').notNull(),
    evaluation_id: uuid('evaluation_id')
      .notNull()
      .references(() => performanceEvaluation.id, { onDelete: 'cascade' }),
    criterion_id: uuid('criterion_id')
      .notNull()
      .references(() => performanceConfigCriterion.id),
    // numeric, not integer: the scale steps by a half point.
    score: numeric('score', { precision: 2, scale: 1 }).notNull(),
    evidence: text('evidence').notNull().default(''),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.evaluation_id, t.criterion_id] }),
    check(
      'perf_eval_score_range',
      sql`score >= ${sql.raw(String(SCORE_MIN))} AND score <= ${sql.raw(String(SCORE_MAX))}`,
    ),
    // Half points only — 3.5 is a score, 3.4 is a typo.
    check('perf_eval_score_step', sql`(score * 2) = trunc(score * 2)`),
  ],
);

export const UNLOCK_ACTIONS = ['unlock', 'relock'] as const;

/** A manual unlock may reopen an account's cycle for at most this many days (FUT-781). */
export const UNLOCK_MAX_DAYS = 5;

/**
 * Append-only audit log of PMO manual cycle unlock / re-lock actions (FUT-781).
 *
 * One row per action, scoped to a single account for one review month. Rows are never
 * updated or deleted — an early re-lock is a new `relock` row. The current state for a
 * (review_month, account) is the latest row by `seq`: unlocked while that row is an
 * `unlock` whose `expires_at` is still in the future, locked otherwise. Expiry is
 * therefore evaluated on read; no scheduled job re-locks anything.
 *
 * `expires_at` is set on `unlock` rows and NULL on `relock` rows.
 */
export const performanceCycleUnlock = peopleSchema.table(
  'performance_cycle_unlock',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Insertion order. `created_at` alone cannot order the log: two actions can share a
     * timestamp (same millisecond in production, same injected instant under test), and
     * falling back to the random uuid would make "latest row wins" non-deterministic.
     */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    tenant_id: uuid('tenant_id').notNull(),
    review_month: text('review_month').notNull(),
    account_id: uuid('account_id').notNull(),
    action: textEnum('action', UNLOCK_ACTIONS).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    actor_person_id: uuid('actor_person_id'),
    actor_user_id: uuid('actor_user_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('perf_cycle_unlock_lookup').on(t.tenant_id, t.review_month, t.account_id, t.seq),
    textEnumCheck('performance_cycle_unlock', 'action', UNLOCK_ACTIONS),
    check('perf_cycle_unlock_ym', sql`review_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    // An unlock always carries its expiry; a re-lock takes effect immediately.
    check('perf_cycle_unlock_expiry', sql`(action = 'unlock') = (expires_at IS NOT NULL)`),
    check(
      'perf_cycle_unlock_window',
      sql`expires_at IS NULL OR expires_at <= created_at + interval '${sql.raw(String(UNLOCK_MAX_DAYS))} days'`,
    ),
  ],
);
