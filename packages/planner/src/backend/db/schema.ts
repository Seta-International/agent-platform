import { textEnum, textEnumCheck } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const plannerSchema = pgSchema('planner');

export const GROUP_THEMES = ['teal', 'purple', 'green', 'blue', 'pink', 'orange', 'red'] as const;

export const GROUP_VISIBILITY = ['private', 'public'] as const;

export const GROUP_ROLES = ['owner', 'member'] as const;

export const EXTERNAL_SOURCES = ['native', 'm365'] as const;

export const SYNC_STATUS = ['idle', 'pulling', 'pushing', 'error', 'conflict'] as const;

export const JOIN_REQUEST_STATUS = ['pending', 'approved', 'rejected'] as const;

export const AVAILABILITY_STATUS = ['available', 'busy', 'ooo'] as const;

export const TASK_PROGRESS = ['not_started', 'in_progress', 'done'] as const;

export const TASK_PRIORITIES = ['urgent', 'important', 'medium', 'low'] as const;

export const REVIEW_STATES = ['needs_review'] as const;

export const PREVIEW_TYPES = [
  'automatic',
  'noPreview',
  'checklist',
  'description',
  'reference',
] as const;

export const TASK_REFERENCE_TYPES = [
  'word',
  'excel',
  'powerPoint',
  'visio',
  'other',
  'powerBI',
  'oneNote',
  'sharePoint',
  'web',
  'link',
] as const;

export const TASK_LINK_KINDS = ['relates', 'duplicates', 'blocks'] as const;

export const groups = plannerSchema.table(
  'groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    theme: textEnum('theme', GROUP_THEMES).notNull().default('blue'),
    visibility: textEnum('visibility', GROUP_VISIBILITY).notNull().default('private'),
    default_role: textEnum('default_role', GROUP_ROLES).notNull().default('member'),
    external_source: textEnum('external_source', EXTERNAL_SOURCES).notNull().default('native'),
    external_id: text('external_id'),
    external_synced_at: timestamp('external_synced_at', { withTimezone: true }),
    account_id: uuid('account_id'), // pm.account (no cross-schema FK)
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (t) => [
    index('groups_by_tenant_live').on(t.tenant_id, t.deleted_at),
    uniqueIndex('groups_uniq_name_per_tenant')
      .on(t.tenant_id, t.name)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('groups_external_uniq')
      .on(t.tenant_id, t.external_source, t.external_id)
      .where(sql`external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL`),
    check(
      'groups_external_id_required_for_linked',
      sql`external_source = 'native' OR external_id IS NOT NULL`,
    ),
    textEnumCheck('groups', 'theme', GROUP_THEMES),
    textEnumCheck('groups', 'visibility', GROUP_VISIBILITY),
    textEnumCheck('groups', 'default_role', GROUP_ROLES),
    textEnumCheck('groups', 'external_source', EXTERNAL_SOURCES),
  ],
);

export const groupMembers = plannerSchema.table(
  'group_members',
  {
    tenant_id: uuid('tenant_id').notNull(),
    group_id: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').notNull(), // identity.user (no cross-schema FK)
    role: textEnum('role', GROUP_ROLES).notNull().default('member'),
    added_at: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
    added_by: uuid('added_by').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.group_id, t.user_id] }),
    index('group_members_by_user').on(t.tenant_id, t.user_id),
    textEnumCheck('group_members', 'role', GROUP_ROLES),
  ],
);

export const plans = plannerSchema.table(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    group_id: uuid('group_id')
      .notNull()
      .references(() => groups.id),
    name: text('name').notNull(),
    external_source: textEnum('external_source', EXTERNAL_SOURCES).notNull().default('native'),
    external_id: text('external_id'),
    external_etag: text('external_etag'),
    external_synced_at: timestamp('external_synced_at', { withTimezone: true }),
    sync_status: textEnum('sync_status', SYNC_STATUS).notNull().default('idle'),
    last_error: text('last_error'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    archived_at: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (t) => [
    index('plans_by_group_live').on(t.group_id, t.deleted_at),
    uniqueIndex('plans_external_uniq')
      .on(t.tenant_id, t.external_source, t.external_id)
      .where(sql`external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL`),
    textEnumCheck('plans', 'external_source', EXTERNAL_SOURCES),
    textEnumCheck('plans', 'sync_status', SYNC_STATUS),
  ],
);

// Replaces plans.category_descriptions jsonb repeating group: one row per
// (plan, slot) category label, tenant-led PK, FK target for labels.category_slot.
export const planCategories = plannerSchema.table(
  'plan_categories',
  {
    tenant_id: uuid('tenant_id').notNull(),
    plan_id: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    slot: integer('slot').notNull(),
    name: text('name').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.plan_id, t.slot] }),
    // unique() (not uniqueIndex) so it emits as a table constraint inside CREATE TABLE,
    // ahead of labels_category_slot_fk which references it in the squashed baseline.
    unique('plan_categories_plan_slot').on(t.plan_id, t.slot), // FK target for labels
    check('plan_categories_slot_check', sql`slot BETWEEN 1 AND 25`),
    check('plan_categories_name_check', sql`char_length(name) BETWEEN 1 AND 100`),
  ],
);

export const buckets = plannerSchema.table(
  'buckets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    plan_id: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    order_hint: text('order_hint'),
    external_source: textEnum('external_source', EXTERNAL_SOURCES).notNull().default('native'),
    external_id: text('external_id'),
    external_etag: text('external_etag'),
    external_synced_at: timestamp('external_synced_at', { withTimezone: true }),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (t) => [
    index('buckets_by_plan_hint').on(t.tenant_id, t.plan_id, t.order_hint),
    uniqueIndex('buckets_external_uniq')
      .on(t.tenant_id, t.external_source, t.external_id)
      .where(sql`external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL`),
    textEnumCheck('buckets', 'external_source', EXTERNAL_SOURCES),
  ],
);

export const tasks = plannerSchema.table(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    plan_id: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    bucket_id: uuid('bucket_id').references(() => buckets.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    description_text: text('description_text'),
    priority: textEnum('priority', TASK_PRIORITIES).notNull().default('medium'),
    progress: textEnum('progress', TASK_PROGRESS).notNull().default('not_started'),
    is_deferred: boolean('is_deferred').default(false).notNull(),
    preview_type: textEnum('preview_type', PREVIEW_TYPES).notNull().default('automatic'),
    review_state: textEnum('review_state', REVIEW_STATES),
    start_at: timestamp('start_at', { withTimezone: true }),
    due_at: timestamp('due_at', { withTimezone: true }),
    order_hint: text('order_hint'),
    assignee_priority: text('assignee_priority'),
    external_source: textEnum('external_source', EXTERNAL_SOURCES).notNull().default('native'),
    external_id: text('external_id'),
    external_etag: text('external_etag'),
    external_synced_at: timestamp('external_synced_at', { withTimezone: true }),
    sync_status: textEnum('sync_status', SYNC_STATUS).notNull().default('idle'),
    last_error: text('last_error'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (t) => [
    index('tasks_by_plan_live').on(t.tenant_id, t.plan_id, t.deleted_at),
    index('tasks_by_bucket_hint')
      .on(t.tenant_id, t.bucket_id, t.order_hint)
      .where(sql`deleted_at IS NULL`),
    index('tasks_by_due_soon')
      .on(t.tenant_id, t.due_at)
      .where(sql`deleted_at IS NULL AND is_deferred = false AND progress <> 'done'`),
    index('tasks_by_review_state')
      .on(t.tenant_id, t.review_state)
      .where(sql`review_state IS NOT NULL AND deleted_at IS NULL`),
    index('tasks_by_assignee_priority')
      .on(t.tenant_id, t.assignee_priority)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('tasks_external_uniq')
      .on(t.tenant_id, t.external_source, t.external_id)
      .where(sql`external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL`),
    textEnumCheck('tasks', 'priority', TASK_PRIORITIES),
    textEnumCheck('tasks', 'progress', TASK_PROGRESS),
    textEnumCheck('tasks', 'preview_type', PREVIEW_TYPES),
    textEnumCheck('tasks', 'review_state', REVIEW_STATES),
    textEnumCheck('tasks', 'external_source', EXTERNAL_SOURCES),
    textEnumCheck('tasks', 'sync_status', SYNC_STATUS),
  ],
);

export const taskAssignments = plannerSchema.table(
  'task_assignments',
  {
    tenant_id: uuid('tenant_id').notNull(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').notNull(), // identity.user (no cross-schema FK)
    order_hint: text('order_hint'),
    assigned_at: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    external_assigned_at: timestamp('external_assigned_at', { withTimezone: true }),
    assigned_by: uuid('assigned_by').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.task_id, t.user_id] }),
    index('task_assignments_by_user').on(t.tenant_id, t.user_id),
    index('task_assignments_by_user_due').on(t.tenant_id, t.user_id, t.assigned_at),
    index('task_assignments_by_task_hint').on(t.task_id, t.order_hint),
  ],
);

export const checklistItems = plannerSchema.table(
  'checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    checked: boolean('checked').default(false).notNull(),
    order_hint: text('order_hint'),
    external_id: text('external_id'),
    external_etag: text('external_etag'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('checklist_items_by_task_hint').on(t.task_id, t.order_hint),
    uniqueIndex('checklist_items_external_uniq')
      .on(t.tenant_id, t.task_id, t.external_id)
      .where(sql`external_id IS NOT NULL AND deleted_at IS NULL`),
  ],
);

export const labels = plannerSchema.table(
  'labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    plan_id: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    category_slot: integer('category_slot'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('labels_by_plan_live').on(t.plan_id, t.deleted_at),
    uniqueIndex('labels_uniq_name_per_plan')
      .on(t.tenant_id, t.plan_id, t.name)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('labels_category_slot_uniq')
      .on(t.plan_id, t.category_slot)
      .where(sql`category_slot IS NOT NULL AND deleted_at IS NULL`),
    check(
      'labels_category_slot_range',
      sql`category_slot IS NULL OR category_slot BETWEEN 1 AND 25`,
    ),
    foreignKey({
      columns: [t.plan_id, t.category_slot],
      foreignColumns: [planCategories.plan_id, planCategories.slot],
      name: 'labels_category_slot_fk',
    }).onDelete('set null'),
  ],
);

export const taskLabels = plannerSchema.table(
  'task_labels',
  {
    tenant_id: uuid('tenant_id').notNull(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    label_id: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    applied_at: timestamp('applied_at', { withTimezone: true }).defaultNow().notNull(),
    applied_by: uuid('applied_by').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.task_id, t.label_id] }),
    index('task_labels_by_label').on(t.tenant_id, t.label_id),
  ],
);

export const taskReferences = plannerSchema.table(
  'task_references',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    alias: text('alias'),
    type: textEnum('type', TASK_REFERENCE_TYPES).notNull().default('other'),
    preview_priority: text('preview_priority'),
    external_etag: text('external_etag'),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('task_references_uniq_task_url').on(t.tenant_id, t.task_id, t.url),
    index('task_references_by_task').on(t.task_id),
    textEnumCheck('task_references', 'type', TASK_REFERENCE_TYPES),
  ],
);

/**
 * Task↔task relationships. Deliberately NOT `task_references`, which stores a
 * URL and whose type enum is document/web kinds — there is no column there that
 * names a second task (design §0.1).
 *
 * No `version` column: a link row has no mutable field. It is created and
 * deleted, never updated, so optimistic concurrency has nothing to protect.
 * (`task_references` carries a `version` that no code reads.)
 *
 * FKs point at `planner.tasks` — the same schema — so the no-cross-schema-FK rule
 * holds, exactly as `task_references` already does.
 *
 * ONE more index lives in raw SQL beside the generated migration:
 * `task_links_pair_kind_uniq` on (tenant_id, least(src,tgt), greatest(src,tgt),
 * kind). It subsumes a plain UNIQUE(tenant, src, tgt, kind) — which is therefore
 * NOT declared here — and is the guard that stops two opposite merges trashing
 * both tasks (design §8.6). drizzle-kit will not round-trip an index whose KEY is
 * an expression, so it cannot live in this file.
 */
export const taskLinks = plannerSchema.table(
  'task_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    source_task_id: uuid('source_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    target_task_id: uuid('target_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    kind: textEnum('kind', TASK_LINK_KINDS).notNull(),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('task_links_by_source').on(t.tenant_id, t.source_task_id),
    index('task_links_by_target').on(t.tenant_id, t.target_task_id),
    // One canonical duplicate TARGET per task. Partial but not an expression, so
    // drizzle-kit round-trips it — planner already ships 13 indexes of this shape.
    uniqueIndex('task_links_dup_source_uniq')
      .on(t.tenant_id, t.source_task_id)
      .where(sql`kind = 'duplicates'`),
    // Belt as well as braces: the domain refuses a self-link with a sentence,
    // the storage refuses it even if a future caller forgets.
    check('task_links_no_self', sql`source_task_id <> target_task_id`),
    textEnumCheck('task_links', 'kind', TASK_LINK_KINDS),
  ],
);

export const taskComments = plannerSchema.table(
  'task_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    author_id: uuid('author_id').notNull(),
    body: text('body').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('task_comments_by_task_recent')
      .on(t.task_id, t.created_at.desc())
      .where(sql`deleted_at IS NULL`),
    check('task_comments_body_not_empty', sql`length(btrim(body)) > 0`),
    check('task_comments_body_max_len', sql`length(body) <= 4000`),
  ],
);

export const groupJoinRequests = plannerSchema.table(
  'group_join_requests',
  {
    tenant_id: uuid('tenant_id').notNull(),
    group_id: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').notNull(), // identity.user (no cross-schema FK)
    status: textEnum('status', JOIN_REQUEST_STATUS).notNull().default('pending'),
    requested_at: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
    resolved_by: uuid('resolved_by'),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.group_id, t.user_id] }),
    index('join_requests_by_group_pending').on(t.group_id, t.status),
    index('join_requests_by_user').on(t.user_id),
    textEnumCheck('group_join_requests', 'status', JOIN_REQUEST_STATUS),
  ],
);

export const assigneeProjection = plannerSchema.table(
  'assignee_projection',
  {
    user_id: uuid('user_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    display_name: text('display_name').notNull(),
    email: text('email').notNull(),
    availability_status: textEnum('availability_status', AVAILABILITY_STATUS).notNull(),
    timezone: text('timezone').notNull(),
    ooo_until: timestamp('ooo_until', { withTimezone: true }),
    deactivated_at: timestamp('deactivated_at', { withTimezone: true }),
    projection_built_at: timestamp('projection_built_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('assignee_projection_by_tenant_active').on(t.tenant_id, t.deactivated_at),
    textEnumCheck('assignee_projection', 'availability_status', AVAILABILITY_STATUS),
  ],
);
