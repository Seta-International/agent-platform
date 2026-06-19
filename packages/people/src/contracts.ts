import { z } from 'zod';

export const provisionWorkerInput = z.object({
  full_name: z.string().min(1),
  start_date: z.string(),
  employment_type: z.string(),
});
export type ProvisionWorkerInput = z.infer<typeof provisionWorkerInput>;

export const createWorkerInput = z.object({
  full_name: z.string().min(1),
  work_email: z.string().email().optional(),
  start_date: z.string().optional(),
  employment_type: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  phone: z.string().optional(),
  emergency_contact: z.unknown().optional(),
});
export type CreateWorkerInput = z.infer<typeof createWorkerInput>;

export const editWorkerPatch = z.object({
  full_name: z.string().min(1).optional(),
  work_email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  emergency_contact: z.unknown().optional(),
});
export const editWorkerInput = z.object({
  worker_id: z.string().uuid(),
  expected_version: z.number().int().positive().optional(),
  patch: editWorkerPatch,
});
export type EditWorkerInput = z.infer<typeof editWorkerInput>;
