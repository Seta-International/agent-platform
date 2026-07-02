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
  phone: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
  gender: genderValue.nullable().optional(),
  emergency_contact: z.unknown().optional(),
  job_title: z.string().nullable().optional(),
  org_unit_id: z.string().uuid().nullable().optional(),
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
