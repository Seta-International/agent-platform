import { boolean, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

export const coreTenants = core.table('tenants', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  idle_timeout_days: integer('idle_timeout_days').default(30).notNull(),
  local_password_disabled: boolean('local_password_disabled').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
});
