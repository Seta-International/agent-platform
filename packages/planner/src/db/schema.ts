import { halfvec } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const planner = pgSchema('planner');

export const groups = planner.table(
  'groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    theme: text('theme').notNull().default('blue'),
    visibility: text('visibility').notNull().default('private'),
    default_role: text('default_role').notNull().default('member'),
    external_source: text('external_source').notNull().default('native'),
    external_id: text('external_id'),
    external_synced_at: timestamp('external_synced_at', { withTimezone: true }),
    account_id: uuid('account_id'),
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
    check(
      'groups_theme_check',
      sql`theme IN ('teal','purple','green','blue','pink','orange','red')`,
    ),
    check('groups_visibility_check', sql`visibility IN ('private','public')`),
    check('groups_default_role_check', sql`default_role IN ('owner','member')`),
    check('groups_external_source_check', sql`external_source IN ('native','m365')`),
    check(
      'groups_external_id_required_for_linked',
      sql`external_source = 'native' OR external_id IS NOT NULL`,
    ),
  ],
);

export const groupMembers = planner.table(
  'group_members',
  {
    group_id: uuid('group_id').notNull(),
    user_id: uuid('user_id').notNull(),
    role: text('role').notNull().default('member'),
    added_at: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
    added_by: uuid('added_by').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.group_id, t.user_id] }),
    index('group_members_by_user').on(t.user_id),
    check('group_members_role_check', sql`role IN ('owner','member')`),
  ],
);

export const plans = planner.table(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    group_id: uuid('group_id').notNull(),
    name: text('name').notNull(),
    category_descriptions: jsonb('category_descriptions').notNull().default(sql`'{}'::jsonb`),
    external_source: text('external_source').notNull().default('native'),
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
    index('plans_by_group_live').on(t.group_id, t.deleted_at),
    check('plans_external_source_check', sql`external_source IN ('native','m365')`),
  ],
);

export const buckets = planner.table(
  'buckets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    plan_id: uuid('plan_id').notNull(),
    name: text('name').notNull(),
    order_hint: text('order_hint'),
    external_source: text('external_source').notNull().default('native'),
    external_id: text('external_id'),
    external_etag: text('external_etag'),
    external_synced_at: timestamp('external_synced_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (t) => [
    index('buckets_by_plan_hint').on(t.plan_id, t.order_hint),
    check('buckets_external_source_check', sql`external_source IN ('native','m365')`),
  ],
);

export const tasks = planner.table(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    plan_id: uuid('plan_id').notNull(),
    bucket_id: uuid('bucket_id'),
    title: text('title').notNull(),
    description: text('description'),
    priority_number: integer('priority_number').default(5).notNull(),
    percent_complete: integer('percent_complete').default(0).notNull(),
    is_deferred: boolean('is_deferred').default(false).notNull(),
    preview_type: text('preview_type').default('automatic').notNull(),
    review_state: text('review_state', { enum: ['needs_review'] }),
    skill_tags: text('skill_tags').array().default([]).notNull(),
    start_at: timestamp('start_at', { withTimezone: true }),
    due_at: timestamp('due_at', { withTimezone: true }),
    order_hint: text('order_hint'),
    assignee_priority: text('assignee_priority'),
    external_source: text('external_source').notNull().default('native'),
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
    index('tasks_by_plan_live').on(t.tenant_id, t.plan_id, t.deleted_at),
    index('tasks_by_bucket_hint').on(t.bucket_id, t.order_hint),
    index('tasks_by_due_soon')
      .on(t.tenant_id, t.due_at)
      .where(sql`deleted_at IS NULL AND is_deferred = false AND percent_complete < 100`),
    index('tasks_by_skill_tags').using('gin', t.skill_tags),
    index('tasks_by_review_state')
      .on(t.tenant_id, t.review_state)
      .where(sql`review_state IS NOT NULL AND deleted_at IS NULL`),
    check('tasks_percent_complete_range', sql`percent_complete BETWEEN 0 AND 100`),
    check('tasks_priority_number_set', sql`priority_number IN (1,3,5,9)`),
    check(
      'tasks_preview_type_check',
      sql`preview_type IN ('automatic','noPreview','checklist','description','reference')`,
    ),
    check('tasks_external_source_check', sql`external_source IN ('native','m365')`),
  ],
);

export const taskAssignments = planner.table(
  'task_assignments',
  {
    task_id: uuid('task_id').notNull(),
    user_id: uuid('user_id').notNull(),
    order_hint: text('order_hint'),
    assigned_at: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    assigned_by: uuid('assigned_by').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.task_id, t.user_id] }),
    index('task_assignments_by_user').on(t.user_id),
    index('task_assignments_by_task_hint').on(t.task_id, t.order_hint),
  ],
);

export const checklistItems = planner.table(
  'checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task_id: uuid('task_id').notNull(),
    label: text('label').notNull(),
    checked: boolean('checked').default(false).notNull(),
    order_hint: text('order_hint'),
    external_id: text('external_id'),
    external_etag: text('external_etag'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('checklist_items_by_task_hint').on(t.task_id, t.order_hint)],
);

export const labels = planner.table(
  'labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    plan_id: uuid('plan_id').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    category_slot: integer('category_slot'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('labels_by_plan_live').on(t.plan_id, t.deleted_at),
    check(
      'labels_category_slot_range',
      sql`category_slot IS NULL OR category_slot BETWEEN 1 AND 25`,
    ),
  ],
);

export const taskLabels = planner.table(
  'task_labels',
  {
    task_id: uuid('task_id').notNull(),
    label_id: uuid('label_id').notNull(),
    applied_at: timestamp('applied_at', { withTimezone: true }).defaultNow().notNull(),
    applied_by: uuid('applied_by').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.task_id, t.label_id] }),
    index('task_labels_by_label').on(t.label_id),
  ],
);

export const taskReferences = planner.table(
  'task_references',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    task_id: uuid('task_id').notNull(),
    url: text('url').notNull(),
    alias: text('alias'),
    type: text('type').notNull().default('other'),
    preview_priority: text('preview_priority'),
    external_etag: text('external_etag'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('task_references_uniq_task_url').on(t.task_id, t.url),
    index('task_references_by_task').on(t.task_id),
    check(
      'task_references_type_check',
      sql`type IN ('word','excel','powerPoint','visio','other','powerBI','oneNote','sharePoint','web','link')`,
    ),
  ],
);

export const assigneeProjection = planner.table(
  'assignee_projection',
  {
    user_id: uuid('user_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    display_name: text('display_name').notNull(),
    email: text('email').notNull(),
    skills: text('skills').array().default([]).notNull(),
    availability_status: text('availability_status').notNull(),
    timezone: text('timezone').notNull(),
    ooo_until: timestamp('ooo_until', { withTimezone: true }),
    deactivated_at: timestamp('deactivated_at', { withTimezone: true }),
    projection_built_at: timestamp('projection_built_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('assignee_projection_by_tenant_active').on(t.tenant_id, t.deactivated_at)],
);

export const taskEmbeddings = planner.table(
  'task_embeddings',
  {
    tenant_id: uuid('tenant_id').notNull(),
    task_id: bigint('task_id', { mode: 'bigint' }).notNull(),
    chunk_ordinal: integer('chunk_ordinal').notNull(),
    chunk_text: text('chunk_text').notNull(),
    source_hash: text('source_hash').notNull(),
    embedding: halfvec('embedding', { dimensions: 1536 }).notNull(),
    model_id: text('model_id').notNull(),
    embedded_at: timestamp('embedded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.task_id, t.chunk_ordinal] })],
);
