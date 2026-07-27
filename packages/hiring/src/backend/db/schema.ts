import { textEnum, textEnumCheck } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const hiringSchema = pgSchema('hiring');

export const REQUISITION_KINDS = ['replacement', 'new'] as const;

export const APPROVAL_STATUS = ['draft', 'pending_approval', 'approved', 'rejected'] as const;

export const REQUISITION_STATUS = ['open', 'on_hold', 'filled', 'cancelled'] as const;

export const REQUISITION_STAGES = ['sourcing', 'screening', 'interview', 'offer'] as const;

export const INTERVIEW_MODES = ['online', 'onsite', 'either'] as const;

export const OPENING_STATUS = ['open', 'filled', 'closed', 'cancelled'] as const;

export const JD_VARIANTS = ['internal', 'external'] as const;

export const JD_SECTIONS = ['about', 'responsibilities', 'requirements', 'nice_to_have'] as const;

export const JD_TEMPLATE_KINDS = ['role', 'intro', 'closing'] as const;

export const APPLICATION_KINDS = ['external', 'internal'] as const;

export const APPLICATION_STAGES = ['new', 'screening', 'interview', 'offer'] as const;

export const APPLICATION_STATUS = [
  'active',
  'hired',
  'rejected',
  'transferred',
  // Terminal: the requisition was cancelled while this application was still active.
  'cancelled',
] as const;

export const REJECTION_CATEGORIES = ['rejected_by_us', 'withdrew', 'other'] as const;

export const CANDIDATE_EVENT_KINDS = [
  'created',
  'stage_changed',
  'hired',
  'cancelled',
  'rejected',
  'transferred',
  'rating_changed',
  'note_changed',
  'skills_changed',
  'profile_changed',
] as const;

export const GENDERS = ['male', 'female', 'prefer_not_to_say'] as const;

export const requisition = hiringSchema.table(
  'requisition',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    title: text('title').notNull(),
    role_title: text('role_title'),
    grade: text('grade'),
    account_id: uuid('account_id'),
    project_id: uuid('project_id'),
    kind: textEnum('kind', REQUISITION_KINDS).notNull().default('new'),
    approval_status: textEnum('approval_status', APPROVAL_STATUS).notNull().default('draft'),
    status: textEnum('status', REQUISITION_STATUS).notNull().default('open'),
    stage: textEnum('stage', REQUISITION_STAGES).notNull().default('sourcing'),
    owner_user_id: uuid('owner_user_id'),
    due_date: date('due_date'),
    start_date: date('start_date'),
    note: text('note'),
    default_interview_mode: textEnum('default_interview_mode', INTERVIEW_MODES),
    // Lazy column-level reference: reason is declared after requisition below —
    // a table-level foreignKey() would evaluate `reason` eagerly and hit the TDZ.
    // Only meaningful when status = 'cancelled' (see closeRequisition in requisition-lifecycle.ts).
    close_reason_id: uuid('close_reason_id').references((): AnyPgColumn => reason.id),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('requisition_by_status_stage').on(t.tenant_id, t.status, t.stage),
    index('requisition_by_account').on(t.tenant_id, t.account_id),
    textEnumCheck('requisition', 'kind', REQUISITION_KINDS),
    textEnumCheck('requisition', 'approval_status', APPROVAL_STATUS),
    textEnumCheck('requisition', 'status', REQUISITION_STATUS),
    textEnumCheck('requisition', 'stage', REQUISITION_STAGES),
    textEnumCheck('requisition', 'default_interview_mode', INTERVIEW_MODES),
  ],
);

export const opening = hiringSchema.table(
  'opening',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    requisition_id: uuid('requisition_id')
      .notNull()
      .references(() => requisition.id),
    seq: integer('seq').notNull(),
    status: textEnum('status', OPENING_STATUS).notNull().default('open'),
    // Lazy column-level reference (not table-level foreignKey()): reason
    // is declared after opening below — a table-level foreignKey() would evaluate
    // `reason` eagerly and hit the TDZ.
    close_reason_id: uuid('close_reason_id').references((): AnyPgColumn => reason.id),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    // Lazy column-level reference: application is declared after opening below —
    // a table-level foreignKey() would evaluate `application` eagerly and hit the TDZ.
    hired_application_id: uuid('hired_application_id').references(
      (): AnyPgColumn => application.id,
      { onDelete: 'set null' },
    ),
    resource_request_id: uuid('resource_request_id'),
    position_id: uuid('position_id'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('opening_uniq_seq').on(t.tenant_id, t.requisition_id, t.seq),
    uniqueIndex('opening_uniq_resource_request')
      .on(t.tenant_id, t.resource_request_id)
      .where(sql`resource_request_id IS NOT NULL`),
    index('opening_by_requisition').on(t.tenant_id, t.requisition_id),
    index('opening_by_hired_application').on(t.tenant_id, t.hired_application_id),
    textEnumCheck('opening', 'status', OPENING_STATUS),
  ],
);

export const requisitionJdSection = hiringSchema.table(
  'requisition_jd_section',
  {
    tenant_id: uuid('tenant_id').notNull(),
    requisition_id: uuid('requisition_id')
      .notNull()
      .references(() => requisition.id, { onDelete: 'cascade' }),
    variant: textEnum('variant', JD_VARIANTS).notNull(),
    section: textEnum('section', JD_SECTIONS).notNull(),
    body: text('body').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.requisition_id, t.variant, t.section] }),
    textEnumCheck('requisition_jd_section', 'variant', JD_VARIANTS),
    textEnumCheck('requisition_jd_section', 'section', JD_SECTIONS),
  ],
);

export const requisitionSkill = hiringSchema.table(
  'requisition_skill',
  {
    tenant_id: uuid('tenant_id').notNull(),
    requisition_id: uuid('requisition_id')
      .notNull()
      .references(() => requisition.id, { onDelete: 'cascade' }),
    skill_id: uuid('skill_id').notNull(), // core.skill (no cross-schema FK)
    skill_name: text('skill_name').notNull(),
    min_level: integer('min_level'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.requisition_id, t.skill_id] }),
    index('requisition_skill_by_skill').on(t.tenant_id, t.skill_id),
  ],
);

export const REASON_KINDS = ['opening_close', 'rejection'] as const;

export const reason = hiringSchema.table(
  'reason',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    kind: textEnum('kind', REASON_KINDS).notNull(),
    label: text('label').notNull(),
    category: textEnum('category', REJECTION_CATEGORIES),
    active: boolean('active').notNull().default(true),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('reason_by_tenant_kind').on(t.tenant_id, t.kind),
    uniqueIndex('reason_uniq_label').on(t.tenant_id, t.kind, t.label),
    textEnumCheck('reason', 'kind', REASON_KINDS),
    textEnumCheck('reason', 'category', REJECTION_CATEGORIES),
    check(
      'reason_category_required_for_rejection',
      sql`kind <> 'rejection' OR category IS NOT NULL`,
    ),
  ],
);

export const jdTemplate = hiringSchema.table(
  'jd_template',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    kind: textEnum('kind', JD_TEMPLATE_KINDS).notNull(),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('jd_template_uniq_name').on(t.tenant_id, t.name),
    textEnumCheck('jd_template', 'kind', JD_TEMPLATE_KINDS),
  ],
);

export const jdTemplateSection = hiringSchema.table(
  'jd_template_section',
  {
    tenant_id: uuid('tenant_id').notNull(),
    template_id: uuid('template_id')
      .notNull()
      .references(() => jdTemplate.id, { onDelete: 'cascade' }),
    variant: textEnum('variant', JD_VARIANTS).notNull(),
    section: textEnum('section', JD_SECTIONS).notNull(),
    body: text('body').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.template_id, t.variant, t.section] }),
    textEnumCheck('jd_template_section', 'variant', JD_VARIANTS),
    textEnumCheck('jd_template_section', 'section', JD_SECTIONS),
  ],
);

export const candidate = hiringSchema.table(
  'candidate',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    // The identity.user who owns this candidate profile, set only for self-created internal
    // applications (see applyInternalRequisition). Recruiter-added candidates leave this null.
    // Bare uuid — no cross-schema FK. This is the stable link for "the same user re-applying";
    // matching by contact email alone merged unrelated candidates that reused an email (FUT-761).
    user_id: uuid('user_id'),
    name: text('name').notNull(),
    source: text('source'),
    contact: jsonb('contact'),
    dob: date('dob'),
    gender: textEnum('gender', GENDERS),
    cv_storage_key: text('cv_storage_key'),
    cv_sha256: text('cv_sha256'),
    seniority: text('seniority'),
    segment: text('segment'),
    source_cost: numeric('source_cost', { precision: 15, scale: 4 }),
    version: integer('version').default(1).notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('candidate_by_tenant').on(t.tenant_id, t.created_at),
    index('candidate_by_user').on(t.tenant_id, t.user_id),
    index('candidate_by_cv_sha256').on(t.tenant_id, t.cv_sha256),
    textEnumCheck('candidate', 'gender', GENDERS),
  ],
);

export const candidateSkill = hiringSchema.table(
  'candidate_skill',
  {
    tenant_id: uuid('tenant_id').notNull(),
    candidate_id: uuid('candidate_id')
      .notNull()
      .references(() => candidate.id, { onDelete: 'cascade' }),
    skill_id: uuid('skill_id').notNull(), // core.skill (no cross-schema FK)
    skill_name: text('skill_name').notNull(),
    level: integer('level'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.candidate_id, t.skill_id] }),
    index('candidate_skill_by_skill').on(t.tenant_id, t.skill_id),
    check('candidate_skill_level_check', sql`level IS NULL OR level BETWEEN 0 AND 5`),
  ],
);

export const candidateEvent = hiringSchema.table(
  'candidate_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    candidate_id: uuid('candidate_id')
      .notNull()
      .references(() => candidate.id, { onDelete: 'cascade' }),
    // Lazy column-level reference: application is declared after candidate_event below —
    // a table-level foreignKey() would evaluate `application` eagerly and hit the TDZ.
    application_id: uuid('application_id').references((): AnyPgColumn => application.id, {
      onDelete: 'set null',
    }),
    kind: textEnum('kind', CANDIDATE_EVENT_KINDS).notNull(),
    summary: text('summary').notNull(),
    detail: jsonb('detail'),
    actor_user_id: uuid('actor_user_id'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('candidate_event_by_candidate').on(t.tenant_id, t.candidate_id, t.created_at),
    index('candidate_event_by_application').on(t.tenant_id, t.application_id),
    textEnumCheck('candidate_event', 'kind', CANDIDATE_EVENT_KINDS),
  ],
);

export const application = hiringSchema.table(
  'application',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    requisition_id: uuid('requisition_id')
      .notNull()
      .references(() => requisition.id),
    kind: textEnum('kind', APPLICATION_KINDS).notNull(),
    candidate_id: uuid('candidate_id').references(() => candidate.id),
    person_id: uuid('person_id'), // people.person (no cross-schema FK)
    stage: textEnum('stage', APPLICATION_STAGES).notNull().default('new'),
    status: textEnum('status', APPLICATION_STATUS).notNull().default('active'),
    rating: integer('rating'),
    rejection_reason_id: uuid('rejection_reason_id').references(() => reason.id),
    tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
    note: text('note'),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    superseded_by_application_id: uuid('superseded_by_application_id'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('application_uniq_candidate')
      .on(t.tenant_id, t.requisition_id, t.candidate_id)
      .where(sql`candidate_id IS NOT NULL AND status = 'active'`),
    uniqueIndex('application_uniq_worker')
      .on(t.tenant_id, t.requisition_id, t.person_id)
      .where(sql`person_id IS NOT NULL AND status = 'active'`),
    index('application_by_requisition').on(t.tenant_id, t.requisition_id),
    index('application_by_candidate').on(t.tenant_id, t.candidate_id),
    index('application_by_worker').on(t.tenant_id, t.person_id),
    // Self-FK via the table's own column proxy (t) — not the lazily-bound `application`
    // export — since both endpoints belong to this table, no TDZ issue like the
    // cross-table forward refs above.
    foreignKey({
      columns: [t.superseded_by_application_id],
      foreignColumns: [t.id],
      name: 'application_superseded_by_fk',
    }).onDelete('set null'),
    textEnumCheck('application', 'kind', APPLICATION_KINDS),
    textEnumCheck('application', 'stage', APPLICATION_STAGES),
    textEnumCheck('application', 'status', APPLICATION_STATUS),
    check('application_rating_check', sql`rating IS NULL OR rating BETWEEN 0 AND 5`),
    check(
      'application_one_subject_check',
      sql`((candidate_id IS NOT NULL) <> (person_id IS NOT NULL)) OR (status = 'hired' AND candidate_id IS NOT NULL AND person_id IS NOT NULL)`,
    ),
  ],
);

// Local read-model projections of pm.account / pm.project names, fed by pm domain events
// (see backend/subscribers). Hiring stores only account_id/project_id on a requisition;
// these tables resolve the display names without a cross-module join.
export const accountProjection = hiringSchema.table('account_projection', {
  account_id: uuid('account_id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
});

export const projectProjection = hiringSchema.table(
  'project_projection',
  {
    project_id: uuid('project_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    account_id: uuid('account_id').notNull(),
    name: text('name').notNull(),
  },
  (t) => [index('project_projection_by_account').on(t.tenant_id, t.account_id)],
);
