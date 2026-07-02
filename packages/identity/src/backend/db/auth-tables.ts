import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { identity } from './pg-schema.ts';

export const user = identity.table(
  'user',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    email_verified: boolean('email_verified').default(false).notNull(),
    // No FK to core.tenants — cross-schema FKs are disallowed; tenant consistency is event-driven.
    tenant_id: uuid('tenant_id').notNull(),
    deactivated_at: timestamp('deactivated_at', { withTimezone: true }),
    image: text('image'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('user_tenant_idx').on(t.tenant_id),
    uniqueIndex('user_tenant_email_uniq')
      .on(t.tenant_id, sql`lower(${t.email})`)
      .where(sql`${t.deactivated_at} IS NULL`),
  ],
);

export const session = identity.table(
  'session',
  {
    id: uuid('id').primaryKey(),
    user_id: uuid('user_id').notNull(),
    token: text('token').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip_address: text('ip_address'),
    user_agent: text('user_agent'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.user_id],
      foreignColumns: [user.id],
      name: 'session_user_id_fkey',
    }).onDelete('cascade'),
    unique('session_token_unique').on(t.token),
    index('session_user_id_idx').on(t.user_id),
  ],
);

export const account = identity.table(
  'account',
  {
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
  },
  (t) => [
    foreignKey({
      columns: [t.user_id],
      foreignColumns: [user.id],
      name: 'account_user_id_fkey',
    }).onDelete('cascade'),
    index('account_user_id_idx').on(t.user_id),
  ],
);

// Column names are camelCase to match better-auth's drizzle adapter defaults —
// the rateLimit model has no `fields` mapping in betterAuth() config.
export const rateLimit = identity.table('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('lastRequest', { mode: 'number' }).notNull(),
});

export const verification = identity.table(
  'verification',
  {
    id: uuid('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);
