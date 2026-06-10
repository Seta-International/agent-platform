export const BILLING_PERMISSIONS = ['billing.read'] as const;
export type BillingPermission = (typeof BILLING_PERMISSIONS)[number];

export const BILLING_ROLE_SLUGS = ['billing.viewer'] as const;
export type BillingRoleSlug = (typeof BILLING_ROLE_SLUGS)[number];

export const BILLING_ROLE_PERMISSIONS: Record<BillingRoleSlug, BillingPermission[]> = {
  'billing.viewer': ['billing.read'],
};
