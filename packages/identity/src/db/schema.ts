import { halfvec } from '@seta/shared-db';
import { boolean, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export { identity } from './pg-schema.ts';

import { identity } from './pg-schema.ts';

export const userProfile = identity.table('user_profile', {
  user_id: uuid('user_id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  skills: text('skills').array().default([]).notNull(),
  role: text('role'),
  availability_status: text('availability_status', { enum: ['available', 'busy', 'ooo'] })
    .default('available')
    .notNull(),
  ooo_until: timestamp('ooo_until', { withTimezone: true }),
  timezone: text('timezone').default('UTC').notNull(),
  working_hours: jsonb('working_hours').$type<{ start: string; end: string } | null>(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const roleGrants = identity.table('role_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  tenant_id: uuid('tenant_id').notNull(),
  role_slug: text('role_slug').notNull(),
  scope_type: text('scope_type', { enum: ['tenant', 'group'] }).notNull(),
  scope_id: text('scope_id'),
  granted_by: uuid('granted_by'),
  granted_via: text('granted_via', { enum: ['admin', 'cli', 'idp'] })
    .default('admin')
    .notNull(),
  granted_at: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  revoked_by: uuid('revoked_by'),
});

export const failedLoginAttempts = identity.table('failed_login_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  ip: text('ip').notNull(),
  attempted_at: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
  reason: text('reason').notNull(),
});

export const tenantSsoProviders = identity.table(
  'tenant_sso_providers',
  {
    tenant_id: uuid('tenant_id').notNull(),
    provider_id: text('provider_id').notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    config: jsonb('config').notNull(),
    email_domains: text('email_domains').array().default([]).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.provider_id] })],
);

export const userProfileEmbeddings = identity.table(
  'user_profile_embeddings',
  {
    tenant_id: uuid('tenant_id').notNull(),
    user_id: uuid('user_id').notNull(),
    source_hash: text('source_hash').notNull(),
    embedding: halfvec('embedding', { dimensions: 1536 }).notNull(),
    model_id: text('model_id').notNull(),
    embedded_at: timestamp('embedded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.user_id] })],
);

export * from './auth-tables.ts';
