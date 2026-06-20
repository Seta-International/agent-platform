import { z } from 'zod';

export const accountCreatedPayload = z.object({
  account_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type AccountCreatedPayload = z.infer<typeof accountCreatedPayload>;

export const accountUpdatedPayload = z.object({
  account_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  fields: z.array(z.string()),
});
export type AccountUpdatedPayload = z.infer<typeof accountUpdatedPayload>;

export const accountRecruiterChangedPayload = z.object({
  account_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  recruiter_worker_id: z.string().uuid(),
});
export type AccountRecruiterChangedPayload = z.infer<typeof accountRecruiterChangedPayload>;

export const PM_ACCOUNT_CREATED = 'pm.account.created';
export const PM_ACCOUNT_UPDATED = 'pm.account.updated';
export const PM_ACCOUNT_RECRUITER_ASSIGNED = 'pm.account.recruiter.assigned';
export const PM_ACCOUNT_RECRUITER_UNASSIGNED = 'pm.account.recruiter.unassigned';

export const PM_EVENTS = {
  'pm.account.created': accountCreatedPayload,
  'pm.account.updated': accountUpdatedPayload,
  'pm.account.recruiter.assigned': accountRecruiterChangedPayload,
  'pm.account.recruiter.unassigned': accountRecruiterChangedPayload,
} as const satisfies Record<string, z.ZodSchema>;
