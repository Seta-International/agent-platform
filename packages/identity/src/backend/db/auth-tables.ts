import { bigint, boolean, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { identity } from './pg-schema.ts';

export const user = identity.table('user', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  email_verified: boolean('email_verified').default(false).notNull(),
  tenant_id: uuid('tenant_id').notNull(),
  deactivated_at: timestamp('deactivated_at', { withTimezone: true }),
  image: text('image'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const session = identity.table('session', {
  id: uuid('id').primaryKey(),
  user_id: uuid('user_id').notNull(),
  token: text('token').notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  ip_address: text('ip_address'),
  user_agent: text('user_agent'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const account = identity.table('account', {
  id: uuid('id').primaryKey(),
  user_id: uuid('user_id').notNull(),
  provider_id: text('provider_id').notNull(),
  account_id: text('account_id').notNull(),
  password: text('password'),
  access_token: text('access_token'),
  refresh_token: text('refresh_token'),
  access_token_expires_at: timestamp('access_token_expires_at', { withTimezone: true }),
  refresh_token_expires_at: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  id_token: text('id_token'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Column names are camelCase to match better-auth's drizzle adapter defaults —
// the rateLimit model has no `fields` mapping in betterAuth() config.
export const rateLimit = identity.table('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('lastRequest', { mode: 'number' }).notNull(),
});

export const verification = identity.table('verification', {
  id: uuid('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
