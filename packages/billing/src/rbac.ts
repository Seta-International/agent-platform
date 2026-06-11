import { type Statement, toManifest } from '@seta/shared-rbac';

export const billingStatement = {
  billing: ['read'],
} as const satisfies Statement;

const roleStatements = {
  'billing.viewer': {
    billing: ['read'],
  },
} as const satisfies Record<string, Statement>;

export const billingRbac = toManifest(
  'billing',
  billingStatement,
  roleStatements,
  { 'billing.viewer': 'Read tenant AI usage, budgets, and pricing' },
  { 'billing.read': 'Read tenant AI usage, budgets, and pricing' },
);

export type BillingPermission = (typeof billingRbac.permissions)[number]['key'];

export const BILLING_PERMISSIONS = billingRbac.permissions.map((p) => p.key);

export const BILLING_ROLE_SLUGS = billingRbac.roles.map((r) => r.slug) as Array<'billing.viewer'>;
export type BillingRoleSlug = (typeof BILLING_ROLE_SLUGS)[number];

export const BILLING_ROLE_PERMISSIONS = Object.fromEntries(
  billingRbac.roles.map((r) => [r.slug, r.permissions]),
) as Record<BillingRoleSlug, string[]>;
