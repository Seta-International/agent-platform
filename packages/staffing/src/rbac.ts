export const STAFFING_PERMISSIONS = [
  'staffing.workflow.read',
  'staffing.workflow.run',
  'staffing.workflow.cancel',
] as const;
export type StaffingPermission = (typeof STAFFING_PERMISSIONS)[number];

export const STAFFING_ROLE_SLUGS = ['staffing.operator', 'staffing.viewer'] as const;
export type StaffingRoleSlug = (typeof STAFFING_ROLE_SLUGS)[number];

export const STAFFING_ROLE_PERMISSIONS: Record<StaffingRoleSlug, StaffingPermission[]> = {
  'staffing.operator': [
    'staffing.workflow.read',
    'staffing.workflow.run',
    'staffing.workflow.cancel',
  ],
  'staffing.viewer': ['staffing.workflow.read'],
};
