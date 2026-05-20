import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
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
  ],
);

export const groupMembers = planner.table(
  'group_members',
  {
    group_id: uuid('group_id').notNull(),
    user_id: uuid('user_id').notNull(),
    added_at: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
    added_by: uuid('added_by').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.group_id, t.user_id] }),
    index('group_members_by_user').on(t.user_id),
  ],
);

export const plans = planner.table(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    group_id: uuid('group_id').notNull(),
    name: text('name').notNull(),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (t) => [index('plans_by_group_live').on(t.group_id, t.deleted_at)],
);

export const buckets = planner.table(
  'buckets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    plan_id: uuid('plan_id').notNull(),
    name: text('name').notNull(),
    sort_order: bigint('sort_order', { mode: 'number' }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (t) => [index('buckets_by_plan_order').on(t.plan_id, t.sort_order)],
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
    priority: text('priority', { enum: ['urgent', 'important', 'medium', 'low'] })
      .default('medium')
      .notNull(),
    progress: text('progress', { enum: ['not_started', 'in_progress', 'completed', 'deferred'] })
      .default('not_started')
      .notNull(),
    review_state: text('review_state', { enum: ['needs_review'] }),
    skill_tags: text('skill_tags').array().default([]).notNull(),
    due_at: timestamp('due_at', { withTimezone: true }),
    sort_order: bigint('sort_order', { mode: 'number' }).notNull(),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
  },
  (t) => [
    index('tasks_by_plan_live').on(t.tenant_id, t.plan_id, t.deleted_at),
    index('tasks_by_bucket_order').on(t.bucket_id, t.sort_order),
    index('tasks_by_due_soon')
      .on(t.tenant_id, t.due_at)
      .where(sql`deleted_at IS NULL AND progress <> 'completed'`),
    index('tasks_by_skill_tags').using('gin', t.skill_tags),
    index('tasks_by_review_state')
      .on(t.tenant_id, t.review_state)
      .where(sql`review_state IS NOT NULL AND deleted_at IS NULL`),
  ],
);

export const taskAssignments = planner.table(
  'task_assignments',
  {
    task_id: uuid('task_id').notNull(),
    user_id: uuid('user_id').notNull(),
    assigned_at: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    assigned_by: uuid('assigned_by').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.task_id, t.user_id] }),
    index('task_assignments_by_user').on(t.user_id),
  ],
);

export const checklistItems = planner.table(
  'checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task_id: uuid('task_id').notNull(),
    label: text('label').notNull(),
    checked: boolean('checked').default(false).notNull(),
    sort_order: bigint('sort_order', { mode: 'number' }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('checklist_items_by_task_order').on(t.task_id, t.sort_order)],
);

export const labels = planner.table(
  'labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    plan_id: uuid('plan_id').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('labels_by_plan_live').on(t.plan_id, t.deleted_at)],
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
