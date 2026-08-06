import { textEnum, textEnumCheck } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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

export const ROLE_SCOPE_KINDS = ['tenant', 'org_unit', 'self'] as const;
export const GRANTED_VIA = ['admin', 'cli', 'idp'] as const;
export const PRODUCT_GRANT_SUBJECT_TYPES = ['tenant', 'group', 'user'] as const;
export const PRODUCT_GRANT_GRANTED_VIA = ['admin', 'seed', 'cli'] as const;
export const GRANT_EFFECT = ['grant', 'revoke'] as const;
export const ACCESS_GROUP_KINDS = ['default', 'custom'] as const;

/** Nil uuid sentinel: a whole-scope_kind (non-org_unit) grant in access_group_role.scope_id. */
export const NIL_SCOPE_ID = '00000000-0000-0000-0000-000000000000';

export const roleAssignments = identity.table(
  'role_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    tenant_id: uuid('tenant_id').notNull(),
    role_slug: text('role_slug').notNull(),
    scope_kind: textEnum('scope_kind', ROLE_SCOPE_KINDS).default('tenant').notNull(),
    scope_id: uuid('scope_id'),
    granted_by: uuid('granted_by'),
    granted_via: textEnum('granted_via', GRANTED_VIA).default('admin').notNull(),
    granted_at: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    revoked_by: uuid('revoked_by'),
  },
  (t) => [
    uniqueIndex('role_assignment_active_unique')
      .on(t.tenant_id, t.user_id, t.role_slug, t.scope_kind, sql`COALESCE(scope_id::text, '')`)
      .where(sql`revoked_at IS NULL`),
    index('role_assignment_by_user').on(t.user_id),
    textEnumCheck('role_assignments', 'scope_kind', ROLE_SCOPE_KINDS),
    textEnumCheck('role_assignments', 'granted_via', GRANTED_VIA),
    check(
      'role_assignments_scope_check',
      sql`(scope_kind = 'org_unit' AND scope_id IS NOT NULL) OR (scope_kind IN ('tenant','self') AND scope_id IS NULL)`,
    ),
  ],
);

export const rolePermissionOverlays = identity.table(
  'role_permission_overlays',
  {
    tenant_id: uuid('tenant_id').notNull(),
    role_slug: text('role_slug').notNull(),
    permission_key: text('permission_key').notNull(),
    effect: textEnum('effect', GRANT_EFFECT).notNull(),
    updated_by: uuid('updated_by'),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.role_slug, t.permission_key] }),
    textEnumCheck('role_permission_overlays', 'effect', GRANT_EFFECT),
  ],
);

export const failedLoginAttempts = identity.table(
  'failed_login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    ip: text('ip').notNull(),
    attempted_at: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
    reason: text('reason').notNull(),
  },
  (t) => [
    index('failed_login_attempted_at_idx').on(t.attempted_at),
    index('failed_login_email_ip_idx').on(
      sql`lower(${t.email})`,
      t.ip,
      sql`${t.attempted_at} DESC`,
    ),
  ],
);

export const tenantSsoProviders = identity.table(
  'tenant_sso_providers',
  {
    tenant_id: uuid('tenant_id').notNull(),
    provider_id: text('provider_id').notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    // Owned solely by integrations (projected in via the entra-linkage subscriber). Nullable:
    // a freshly admin-registered provider precedes integrations' M365 config being set.
    entra_tenant_id: uuid('entra_tenant_id'),
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

export const accessGroup = identity.table(
  'access_group',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    kind: textEnum('kind', ACCESS_GROUP_KINDS).default('custom').notNull(),
    is_base: boolean('is_base').default(false).notNull(),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('access_group_tenant_slug').on(t.tenant_id, t.slug),
    textEnumCheck('access_group', 'kind', ACCESS_GROUP_KINDS),
  ],
);

export const accessGroupMembership = identity.table(
  'access_group_membership',
  {
    tenant_id: uuid('tenant_id').notNull(),
    group_id: uuid('group_id').notNull(),
    user_id: uuid('user_id').notNull(),
    added_by: uuid('added_by'),
    added_at: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.group_id, t.user_id] }),
    index('access_group_membership_by_tenant').on(t.tenant_id),
    index('access_group_membership_by_user').on(t.user_id),
  ],
);

export const accessGroupRole = identity.table(
  'access_group_role',
  {
    tenant_id: uuid('tenant_id').notNull(),
    group_id: uuid('group_id').notNull(),
    role_slug: text('role_slug').notNull(),
    scope_kind: textEnum('scope_kind', ROLE_SCOPE_KINDS).default('tenant').notNull(),
    scope_id: uuid('scope_id').notNull().default(NIL_SCOPE_ID),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.group_id, t.role_slug, t.scope_kind, t.scope_id] }),
    index('access_group_role_by_tenant').on(t.tenant_id),
    textEnumCheck('access_group_role', 'scope_kind', ROLE_SCOPE_KINDS),
    check(
      'access_group_role_scope_check',
      sql`(scope_kind = 'org_unit') = (scope_id <> '00000000-0000-0000-0000-000000000000')`,
    ),
  ],
);

export const orgUnitProjection = identity.table(
  'org_unit_projection',
  {
    org_unit_id: uuid('org_unit_id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    parent_id: uuid('parent_id'),
    // Nullable only so a tombstone (delete arriving before its create) can be inserted without
    // a name. Every live (deleted_at IS NULL) row still has one — see the check constraint below.
    name: text('name'),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    // Tombstone marker: set by delete-on-deleted instead of a hard DELETE, so a late create/update
    // for the same org unit can never resurrect a row whose delete already landed (FUT-842).
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('org_unit_projection_by_tenant').on(t.tenant_id),
    check(
      'org_unit_projection_name_required_unless_deleted',
      sql`deleted_at IS NOT NULL OR name IS NOT NULL`,
    ),
  ],
);

export const productGrant = identity.table(
  'product_grant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    subject_type: textEnum('subject_type', PRODUCT_GRANT_SUBJECT_TYPES).notNull(),
    subject_id: uuid('subject_id').notNull(),
    product_id: text('product_id').notNull(),
    effect: textEnum('effect', GRANT_EFFECT).notNull(),
    granted_by: uuid('granted_by'),
    granted_via: textEnum('granted_via', PRODUCT_GRANT_GRANTED_VIA).default('admin').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('product_grant_subject_product').on(
      t.tenant_id,
      t.subject_type,
      t.subject_id,
      t.product_id,
    ),
    textEnumCheck('product_grant', 'subject_type', PRODUCT_GRANT_SUBJECT_TYPES),
    textEnumCheck('product_grant', 'effect', GRANT_EFFECT),
    textEnumCheck('product_grant', 'granted_via', PRODUCT_GRANT_GRANTED_VIA),
  ],
);
