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
