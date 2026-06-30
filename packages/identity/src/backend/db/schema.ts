import {
  boolean,
  index,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export { identity } from './pg-schema.ts';

import { identity } from './pg-schema.ts';

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

export const rolePermissionOverlays = identity.table(
  'role_permission_overlays',
  {
    tenant_id: uuid('tenant_id').notNull(),
    role_slug: text('role_slug').notNull(),
    permission_key: text('permission_key').notNull(),
    effect: text('effect', { enum: ['grant', 'revoke'] }).notNull(),
    updated_by: uuid('updated_by'),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.role_slug, t.permission_key] })],
);

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
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.provider_id] })],
);

export const failedLoginAlertsSent = identity.table('failed_login_alerts_sent', {
  email: text('email').primaryKey(),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull(),
});

export * from './auth-tables.ts';

export const directoryPerson = identity.table(
  'directory_person',
  {
    person_id: uuid('person_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    full_name: text('full_name').notNull(),
    work_email: text('work_email'),
    job_title: text('job_title'),
    employment_status: text('employment_status', { enum: ['active', 'terminated'] })
      .default('active')
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('directory_person_by_tenant').on(t.tenant_id)],
);

export const accessGroup = identity.table(
  'access_group',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    kind: text('kind', { enum: ['default', 'custom'] })
      .default('custom')
      .notNull(),
    is_base: boolean('is_base').default(false).notNull(),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('access_group_tenant_slug').on(t.tenant_id, t.slug)],
);

export const accessGroupMembership = identity.table(
  'access_group_membership',
  {
    group_id: uuid('group_id').notNull(),
    user_id: uuid('user_id').notNull(),
    added_by: uuid('added_by'),
    added_at: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.group_id, t.user_id] }),
    index('access_group_membership_by_user').on(t.user_id),
  ],
);

export const accessGroupRole = identity.table(
  'access_group_role',
  {
    group_id: uuid('group_id').notNull(),
    role_slug: text('role_slug').notNull(),
  },
  (t) => [primaryKey({ columns: [t.group_id, t.role_slug] })],
);
