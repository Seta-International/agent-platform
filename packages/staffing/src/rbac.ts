export const STAFFING_PERMISSIONS = {
  'staffing.run': 'Trigger a staffing workflow run',
} as const;

export type StaffingPermission = keyof typeof STAFFING_PERMISSIONS;
