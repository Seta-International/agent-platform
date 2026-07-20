// packages/planner/tests/fixtures/golden/constants.ts

/** Deterministic UUIDs for the golden dataset. Stable across runs. */

// --- Tenant ---
export const TENANT_ID = '00000000-aaaa-0000-0000-000000000001';
export const TENANT_SLUG = 'seta-demo';
export const TENANT_NAME = 'SETA International';

// --- Actor (test user = "chatting user" in eval cases) ---
export const ACTOR_USER_ID = '00000000-bbbb-0000-0000-000000000001';
export const ACTOR_PERSON_ID = '00000000-cccc-0000-0000-000000000001';
export const ACTOR_NAME = 'Anh Nguyen';
export const ACTOR_EMAIL = 'anh.nguyen@seta-demo.test';

// --- Admin ---
export const ADMIN_USER_ID = '00000000-bbbb-0000-0000-000000000000';

// --- Groups ---
export const GRP_ENG_ID = '00000000-dddd-0000-0000-000000000001';
export const GRP_PLAT_ID = '00000000-dddd-0000-0000-000000000002';
export const GRP_DEVOPS_ID = '00000000-dddd-0000-0000-000000000003';
export const GRP_MKT_ID = '00000000-dddd-0000-0000-000000000004';

// --- Plans ---
export const PLAN_ALPHA_ID = '00000000-eeee-0000-0000-000000000001';
export const PLAN_SPRINT12_ID = '00000000-eeee-0000-0000-000000000002';
export const PLAN_API_MIG_ID = '00000000-eeee-0000-0000-000000000003';
export const PLAN_BETA_ID = '00000000-eeee-0000-0000-000000000004';
export const PLAN_BILLING_ID = '00000000-eeee-0000-0000-000000000005';
export const PLAN_INFRA_ID = '00000000-eeee-0000-0000-000000000006';
export const PLAN_SECURITY_ID = '00000000-eeee-0000-0000-000000000007';
export const PLAN_Q3_ID = '00000000-eeee-0000-0000-000000000008';

// --- Key tasks (testcase specimens) ---
export const TASK_API_RATE_LIMIT_ID = '00000000-ffff-0000-0000-000000000001';
export const TASK_BILLING_SCHEMA_ID = '00000000-ffff-0000-0000-000000000002';
export const TASK_DATA_MIG_ID = '00000000-ffff-0000-0000-000000000003';
export const TASK_AUTH_MIG_ID = '00000000-ffff-0000-0000-000000000004';
export const TASK_LEGACY_MIG_ID = '00000000-ffff-0000-0000-000000000005';
export const TASK_PAYMENT_GW_ID = '00000000-ffff-0000-0000-000000000006';
export const TASK_FIX_LOGIN_ID = '00000000-ffff-0000-0000-000000000007';
export const TASK_UPDATE_DOCS_ID = '00000000-ffff-0000-0000-000000000008';
export const TASK_REVIEW_PR_ID = '00000000-ffff-0000-0000-000000000009';
export const TASK_WRITE_TESTS_ID = '00000000-ffff-0000-0000-00000000000a';
export const TASK_DEPLOY_V2_ID = '00000000-ffff-0000-0000-00000000000b';

// --- Key people ---
export const PERSON_TUAN_ID = '00000000-cccc-0000-0000-000000000002';
export const USER_TUAN_ID = '00000000-bbbb-0000-0000-000000000002';
export const PERSON_LINH_ID = '00000000-cccc-0000-0000-000000000003';
export const USER_LINH_ID = '00000000-bbbb-0000-0000-000000000003';
export const PERSON_MINH_ID = '00000000-cccc-0000-0000-000000000004';
export const USER_MINH_ID = '00000000-bbbb-0000-0000-000000000004';
export const PERSON_DUC_ID = '00000000-cccc-0000-0000-000000000005';
export const USER_DUC_ID = '00000000-bbbb-0000-0000-000000000005';
export const PERSON_HOA_ID = '00000000-cccc-0000-0000-000000000006';
export const USER_HOA_ID = '00000000-bbbb-0000-0000-000000000006';
export const PERSON_THANH_ID = '00000000-cccc-0000-0000-000000000007';
export const USER_THANH_ID = '00000000-bbbb-0000-0000-000000000007';
export const PERSON_CHI_ID = '00000000-cccc-0000-0000-000000000008';
export const USER_CHI_ID = '00000000-bbbb-0000-0000-000000000008';
export const PERSON_NAM_ID = '00000000-cccc-0000-0000-000000000009';
export const USER_NAM_ID = '00000000-bbbb-0000-0000-000000000009';
export const PERSON_LAN_ID = '00000000-cccc-0000-0000-00000000000a';
export const USER_LAN_ID = '00000000-bbbb-0000-0000-00000000000a';
export const PERSON_KHOA_ID = '00000000-cccc-0000-0000-00000000000b';
export const USER_KHOA_ID = '00000000-bbbb-0000-0000-00000000000b';
export const PERSON_THAO_ID = '00000000-cccc-0000-0000-00000000000c';
export const USER_THAO_ID = '00000000-bbbb-0000-0000-00000000000c';

// --- Date helpers ---
/** Returns a Date offset from now by `days` (positive = future, negative = past). */
export function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Start of the current ISO week (Monday 00:00). */
export function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** End of the current ISO week (Sunday 23:59). */
export function endOfWeek(): Date {
  const d = startOfWeek();
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Deterministic UUID generator seeded from a prefix + index. `prefix` may
 * contain non-hex characters (e.g. 'genpers0') — it's mapped through char
 * codes into valid hex so the result is always a well-formed Postgres uuid.
 *
 * Only the first 4 characters of `prefix` are significant (each maps to 2
 * hex digits, and the result is sliced to the uuid's 8-hex-digit first
 * segment) — prefixes that share their first 4 characters collide. Keep
 * prefixes distinct within their first 4 characters.
 */
export function seededId(prefix: string, index: number): string {
  const hex = index.toString(16).padStart(12, '0');
  const seed = [...prefix]
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(8, '0')
    .slice(0, 8);
  return `${seed}-0000-4000-8000-${hex}`;
}
