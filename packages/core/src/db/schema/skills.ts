import { boolean, index, integer, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

export const coreSkillCategory = core.table(
  'skill_category',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    version: integer('version').notNull().default(1),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('skill_category_uniq_name').on(t.tenant_id, t.name)],
);

export const coreSkill = core.table(
  'skill',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    category_id: uuid('category_id')
      .notNull()
      .references(() => coreSkillCategory.id),
    name: text('name').notNull(),
    /** Normalized comparison key derived from `name` (see slugifySkill). */
    slug: text('slug').notNull(),
    active: boolean('active').notNull().default(true),
    version: integer('version').notNull().default(1),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('skill_uniq_name').on(t.tenant_id, t.name),
    index('skill_by_category').on(t.tenant_id, t.category_id),
    index('skill_by_slug').on(t.tenant_id, t.slug),
  ],
);

/**
 * Synonyms/variants that resolve free-text skill mentions to a catalog skill —
 * e.g. the label "reactjs" → the "React" skill. Tenant-scoped, keyed by the
 * normalized `slug` of the alias so lookups match slugifySkill(text).
 */
export const coreSkillAlias = core.table(
  'skill_alias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    skill_id: uuid('skill_id')
      .notNull()
      .references(() => coreSkill.id),
    alias: text('alias').notNull(),
    slug: text('slug').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('skill_alias_uniq_slug').on(t.tenant_id, t.slug),
    index('skill_alias_by_skill').on(t.tenant_id, t.skill_id),
  ],
);
