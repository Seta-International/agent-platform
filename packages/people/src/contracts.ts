import { z } from 'zod';

export const genderValue = z.enum(['male', 'female', 'prefer_not_to_say']);
export type GenderValue = z.infer<typeof genderValue>;
export const GENDER_VALUES = genderValue.options;

export const provisionWorkerInput = z.object({
  full_name: z.string().min(1),
  start_date: z.string(),
  employment_type: z.string(),
});
export type ProvisionWorkerInput = z.infer<typeof provisionWorkerInput>;

export const createWorkerInput = z.object({
  full_name: z.string().min(1),
  employee_no: z.string().optional(),
  work_email: z.string().email().optional(),
  personal_email: z.string().email().optional(),
  start_date: z.string().optional(),
  employment_type: z.string().optional(),
  dob: z.string().optional(),
  gender: genderValue.optional(),
  phone: z.string().optional(),
  emergency_contact: z.unknown().optional(),
  job_title: z.string().optional(),
  org_unit_id: z.string().uuid().optional(),
});
export type CreateWorkerInput = z.infer<typeof createWorkerInput>;

export const editWorkerPatch = z.object({
  full_name: z.string().min(1).optional(),
  work_email: z.string().email().optional(),
  personal_email: z.string().email().nullable().optional(),
  cv_storage_key: z.string().min(1).nullable().optional(),
  phone: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
  gender: genderValue.nullable().optional(),
  emergency_contact: z.unknown().optional(),
  job_title: z.string().nullable().optional(),
  org_unit_id: z.string().uuid().nullable().optional(),
  employee_no: z.string().nullable().optional(),
});
export const editWorkerInput = z.object({
  worker_id: z.string().uuid(),
  expected_version: z.number().int().positive().optional(),
  patch: editWorkerPatch,
});
export type EditWorkerInput = z.infer<typeof editWorkerInput>;

export const orgUnitKind = z.enum(['executive', 'operation', 'function', 'delivery', 'pmo']);
export type OrgUnitKind = z.infer<typeof orgUnitKind>;

export const createOrgUnitInput = z.object({
  name: z.string().min(1),
  kind: orgUnitKind,
  parent_id: z.string().uuid().nullable().optional(),
  head_worker_id: z.string().uuid().nullable().optional(),
  sort: z.number().int().optional(),
});
export type CreateOrgUnitInput = z.infer<typeof createOrgUnitInput>;

export const updateOrgUnitPatch = z.object({
  name: z.string().min(1).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  head_worker_id: z.string().uuid().nullable().optional(),
});
export type UpdateOrgUnitPatch = z.infer<typeof updateOrgUnitPatch>;

export const updateOrgUnitInput = z.object({
  org_unit_id: z.string().uuid(),
  patch: updateOrgUnitPatch,
});

export const deleteOrgUnitInput = z.object({
  org_unit_id: z.string().uuid(),
});

export const performanceContextInput = z.object({
  as_of_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), // YYYY-MM
});
export type PerformanceContextInput = z.infer<typeof performanceContextInput>;

const monthYm = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const cycleStatusQuery = z.object({
  month: monthYm,
});
export type CycleStatusQuery = z.infer<typeof cycleStatusQuery>;

export const cycleStatusEnum = z.enum(['open', 'makeup', 'locked', 'override']);
export type CycleStatus = z.infer<typeof cycleStatusEnum>;

export const cycleStatusResponse = z.object({
  month: monthYm,
  status: cycleStatusEnum,
  /** UTC ISO of the transaction-start timestamp used for classification. */
  evaluated_at: z.string().datetime(),
});
export type CycleStatusResponse = z.infer<typeof cycleStatusResponse>;

export type PerformanceCapacity =
  | { kind: 'am'; account_id: string; label: string }
  | { kind: 'tl'; project_id: string; account_id: string; label: string }
  | { kind: 'member'; project_id: string; account_id: string; label: string };

export const performanceCapacity = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('am'), account_id: z.string().uuid(), label: z.string() }),
  z.object({
    kind: z.literal('tl'),
    project_id: z.string().uuid(),
    account_id: z.string().uuid(),
    label: z.string(),
  }),
  z.object({
    kind: z.literal('member'),
    project_id: z.string().uuid(),
    account_id: z.string().uuid(),
    label: z.string(),
  }),
]);

export const monthTasksQuery = z.object({
  month: monthYm,
});
export type MonthTasksQuery = z.infer<typeof monthTasksQuery>;

/** Server-authored home to-do cards (FUT-695) — FE echoes only. */
export const monthTaskCard = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unscored'),
    unscored: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    interactive: z.boolean(),
  }),
  z.object({
    kind: z.literal('self_assessment'),
    submitted: z.boolean(),
    interactive: z.boolean(),
  }),
  z.object({
    kind: z.literal('morale'),
    submitted: z.boolean(),
    interactive: z.boolean(),
  }),
  z.object({
    kind: z.literal('cycle_locked'),
  }),
]);
export type MonthTaskCard = z.infer<typeof monthTaskCard>;

export const monthTaskGroup = z.object({
  capacity: performanceCapacity,
  label: z.string(),
  cards: z.array(monthTaskCard),
});
export type MonthTaskGroup = z.infer<typeof monthTaskGroup>;

export const monthTasksResponse = z.object({
  month: monthYm,
  cycle_status: cycleStatusEnum,
  groups: z.array(monthTaskGroup),
});
export type MonthTasksResponse = z.infer<typeof monthTasksResponse>;

/**
 * The Performance surface's entry context ("EmployeePort" read). Discriminated
 * on `status`: `no_employee_record` is a first-class state (renders the
 * "Contact HR" block screen), never a 403/404.
 */
export type PerformanceContext =
  | { status: 'no_employee_record' }
  | {
      status: 'ok';
      as_of_month: string;
      person: { person_id: string; full_name: string | null; org_unit_id: string | null };
      /** Session RBAC role slugs (pm.pmo, pm.bod, people.manager, …) for SCR-02 routing. */
      role_slugs: string[];
      /** Sorted: am < tl < member, then label asc, then id asc — deterministic (AC4). */
      capacities: PerformanceCapacity[];
      default_capacity_index: 0 | -1;
    };
