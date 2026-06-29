export const PERSONAL_FIELDS = new Set(['phone', 'dob', 'gender', 'emergency_contact']);
export const ADMIN_ONLY_FIELDS = new Set(['full_name', 'work_email']);

export function classifyField(field: string): 'personal' | 'admin_only' {
  if (PERSONAL_FIELDS.has(field)) return 'personal';
  return 'admin_only';
}
