export const PERSONAL_FIELDS = new Set([
  'phone',
  'dob',
  'gender',
  'emergency_contact',
  'personal_email',
]);
export const ADMIN_ONLY_FIELDS = new Set(['full_name', 'work_email']);

export function classifyField(field: string): 'personal' | 'admin_only' {
  if (PERSONAL_FIELDS.has(field)) return 'personal';
  return 'admin_only';
}

// M365 directory sync (FUT-842) owns these fields on a directory_managed person.
// org_unit_id is deliberately absent: admins keep manual placement and the next
// sync re-asserts Entra's value.
export const M365_OWNED_PERSON_FIELDS = new Set(['full_name', 'work_email', 'employee_no']);
export const M365_OWNED_EMPLOYMENT_FIELDS = new Set(['job_title']);

export function isM365Owned(field: string): boolean {
  return M365_OWNED_PERSON_FIELDS.has(field) || M365_OWNED_EMPLOYMENT_FIELDS.has(field);
}
