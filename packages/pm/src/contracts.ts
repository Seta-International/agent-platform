import { z } from 'zod';

export const createAccountInput = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  am_worker_id: z.string().uuid().optional(),
  recruiter_worker_ids: z.array(z.string().uuid()).optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountInput>;

export const setAccountRecruitersInput = z.object({
  account_id: z.string().uuid(),
  recruiter_worker_ids: z.array(z.string().uuid()),
});
export type SetAccountRecruitersInput = z.infer<typeof setAccountRecruitersInput>;

export const editAccountPatch = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().nullable().optional(),
  am_worker_id: z.string().uuid().nullable().optional(),
});
export const editAccountInput = z.object({
  account_id: z.string().uuid(),
  expected_version: z.number().int().positive().optional(),
  patch: editAccountPatch,
});
export type EditAccountInput = z.infer<typeof editAccountInput>;

export const methodologyEnum = z.enum(['scrum', 'kanban']);
export const pricingEnum = z.enum(['fixed_price', 'time_materials']);
export const phaseEnum = z.enum([
  'initiation',
  'discovery',
  'execution',
  'stabilize',
  'uat',
  'closed',
]);
export const projectStatusEnum = z.enum(['active', 'on_hold', 'closed']);
export const accessLevelEnum = z.enum(['owner', 'edit', 'view']);
export const charterScope = z.object({ in: z.string().default(''), out: z.string().default('') });

export const submitCharterInput = z.object({
  account_id: z.string().uuid(),
  name: z.string().min(1),
  pm_worker_id: z.string().uuid(),
  pmo_worker_id: z.string().uuid().optional(),
  budget_bmm: z.number().nonnegative().optional(),
  team_size: z.number().int().nonnegative().optional(),
  methodology: methodologyEnum.optional(),
  pricing_model: pricingEnum.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  objective: z.string().optional(),
  scope: charterScope.optional(),
});
export type SubmitCharterInput = z.infer<typeof submitCharterInput>;

export const editCharterPatch = submitCharterInput.partial().omit({ account_id: true });
export const editCharterInput = z.object({
  charter_id: z.string().uuid(),
  expected_version: z.number().int().positive().optional(),
  patch: editCharterPatch,
});
export type EditCharterInput = z.infer<typeof editCharterInput>;

export const rejectCharterInput = z.object({
  charter_id: z.string().uuid(),
  expected_version: z.number().int().positive().optional(),
  reason: z.string().min(1),
});
export type RejectCharterInput = z.infer<typeof rejectCharterInput>;

export const charterStatusEnum = z.enum([
  'submitted',
  'pmo_approved',
  'approved',
  'rejected',
  'withdrawn',
]);

const emptyToUndefined = (v: unknown) => (v === '' || v == null ? undefined : v);

export const charterListQuery = z.object({
  status: z.preprocess(emptyToUndefined, charterStatusEnum.optional()),
  account_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  sort: z.enum(['submitted', 'name', 'budget', 'team']).default('submitted'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CharterListQuery = z.infer<typeof charterListQuery>;
export type CharterListQueryInput = z.input<typeof charterListQuery>;

export const editProjectPatch = z.object({
  objective: z.string().nullable().optional(),
  scope: charterScope.nullable().optional(),
  phase: phaseEnum.optional(),
  status: projectStatusEnum.optional(),
  planner_group_id: z.string().uuid().nullable().optional(),
  org_unit_id: z.string().uuid().nullable().optional(),
});
export const editProjectInput = z.object({
  project_id: z.string().uuid(),
  expected_version: z.number().int().positive().optional(),
  patch: editProjectPatch,
});
export type EditProjectInput = z.infer<typeof editProjectInput>;

export const setProjectAccessInput = z.object({
  project_id: z.string().uuid(),
  grants: z.array(z.object({ worker_id: z.string().uuid(), level: accessLevelEnum })),
});
export type SetProjectAccessInput = z.infer<typeof setProjectAccessInput>;

export const staffingPlanLineInput = z.object({
  project_id: z.string().uuid(),
  line_id: z.string().uuid().optional(),
  expected_version: z.number().int().positive().optional(),
  role: z.string().min(1),
  effort_mm: z.number().nonnegative().optional(),
  skills: z.array(z.string()).optional(),
});
export type StaffingPlanLineInput = z.infer<typeof staffingPlanLineInput>;

export const createAllocationInput = z.object({
  project_id: z.string().uuid(),
  worker_id: z.string().uuid().nullable().optional(),
  role: z.string().min(1).nullable().optional(),
  date_from: z.string().nullable().optional(),
  date_to: z.string().nullable().optional(),
  bucket: z.enum(['billable', 'internal', 'bench']).optional().default('billable'),
  planned_pct: z.number().min(0).max(100).nullable().optional(),
  minutes_per_day: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(['placeholder', 'tentative', 'committed']).optional().default('placeholder'),
  note: z.string().nullable().optional(),
});
export type CreateAllocationInput = z.input<typeof createAllocationInput>;

export const updateAllocationInput = z.object({
  expected_version: z.number().int().positive().optional(),
  role: z.string().min(1).nullable().optional(),
  planned_pct: z.number().min(0).max(100).nullable().optional(),
  status: z.enum(['placeholder', 'tentative', 'committed']).optional(),
  date_from: z.string().nullable().optional(),
  date_to: z.string().nullable().optional(),
  bucket: z.enum(['billable', 'internal', 'bench']).optional(),
  note: z.string().nullable().optional(),
});
export type UpdateAllocationInput = z.infer<typeof updateAllocationInput>;
