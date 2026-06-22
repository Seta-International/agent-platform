import { z } from 'zod';

export const accountCreatedPayload = z.object({
  account_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  am_worker_id: z.string().uuid().nullable(),
});
export type AccountCreatedPayload = z.infer<typeof accountCreatedPayload>;

export const accountUpdatedPayload = z.object({
  account_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  am_worker_id: z.string().uuid().nullable(),
  fields: z.array(z.string()),
});
export type AccountUpdatedPayload = z.infer<typeof accountUpdatedPayload>;

export const accountRecruiterChangedPayload = z.object({
  account_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  recruiter_worker_id: z.string().uuid(),
});
export type AccountRecruiterChangedPayload = z.infer<typeof accountRecruiterChangedPayload>;

export const charterSubmittedPayload = z.object({
  charter_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  account_id: z.string().uuid(),
});
export type CharterSubmittedPayload = z.infer<typeof charterSubmittedPayload>;

export const charterUpdatedPayload = z.object({
  charter_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  fields: z.array(z.string()),
});
export type CharterUpdatedPayload = z.infer<typeof charterUpdatedPayload>;

export const charterApprovedPayload = z.object({
  charter_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  project_id: z.string().uuid(),
});
export type CharterApprovedPayload = z.infer<typeof charterApprovedPayload>;

export const charterRejectedPayload = z.object({
  charter_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  reason: z.string(),
});
export type CharterRejectedPayload = z.infer<typeof charterRejectedPayload>;

export const charterWithdrawnPayload = z.object({
  charter_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type CharterWithdrawnPayload = z.infer<typeof charterWithdrawnPayload>;

export const projectCreatedPayload = z.object({
  project_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  account_id: z.string().uuid(),
  charter_id: z.string().uuid(),
  name: z.string(),
});
export type ProjectCreatedPayload = z.infer<typeof projectCreatedPayload>;

export const projectUpdatedPayload = z.object({
  project_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  account_id: z.string().uuid(),
  fields: z.array(z.string()),
});
export type ProjectUpdatedPayload = z.infer<typeof projectUpdatedPayload>;

export const projectChildChangedPayload = z.object({
  project_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type ProjectChildChangedPayload = z.infer<typeof projectChildChangedPayload>;

export const PM_ACCOUNT_CREATED = 'pm.account.created';
export const PM_ACCOUNT_UPDATED = 'pm.account.updated';
export const PM_ACCOUNT_RECRUITER_ASSIGNED = 'pm.account.recruiter.assigned';
export const PM_ACCOUNT_RECRUITER_UNASSIGNED = 'pm.account.recruiter.unassigned';

export const PM_CHARTER_SUBMITTED = 'pm.charter.submitted';
export const PM_CHARTER_UPDATED = 'pm.charter.updated';
export const PM_CHARTER_APPROVED = 'pm.charter.approved';
export const PM_CHARTER_REJECTED = 'pm.charter.rejected';
export const PM_CHARTER_WITHDRAWN = 'pm.charter.withdrawn';

export const PM_PROJECT_CREATED = 'pm.project.created';
export const PM_PROJECT_UPDATED = 'pm.project.updated';
export const PM_PROJECT_ACCESS_CHANGED = 'pm.project.access.changed';
export const PM_PROJECT_STAFFING_PLAN_CHANGED = 'pm.project.staffing_plan.changed';

export const PM_ALLOCATION_CREATED = 'pm.allocation.created';
export const allocationCreatedPayload = z.object({
  allocation_id: z.string().uuid(),
  project_id: z.string().uuid(),
  worker_id: z.string().uuid().nullable(),
  tenant_id: z.string().uuid(),
  account_id: z.string().uuid(),
  account_name: z.string(),
  lead_worker_id: z.string().uuid().nullable(),
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
  planned_pct: z.number().nullable(),
  bucket: z.enum(['billable', 'internal', 'bench']),
});
export type AllocationCreatedPayload = z.infer<typeof allocationCreatedPayload>;

export const PM_ALLOCATION_REMOVED = 'pm.allocation.removed';
export const allocationRemovedPayload = z.object({
  allocation_id: z.string().uuid(),
  project_id: z.string().uuid(),
  worker_id: z.string().uuid().nullable(),
  account_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type AllocationRemovedPayload = z.infer<typeof allocationRemovedPayload>;

export const PM_EVENTS = {
  'pm.account.created': accountCreatedPayload,
  'pm.account.updated': accountUpdatedPayload,
  'pm.account.recruiter.assigned': accountRecruiterChangedPayload,
  'pm.account.recruiter.unassigned': accountRecruiterChangedPayload,
  'pm.charter.submitted': charterSubmittedPayload,
  'pm.charter.updated': charterUpdatedPayload,
  'pm.charter.approved': charterApprovedPayload,
  'pm.charter.rejected': charterRejectedPayload,
  'pm.charter.withdrawn': charterWithdrawnPayload,
  'pm.project.created': projectCreatedPayload,
  'pm.project.updated': projectUpdatedPayload,
  'pm.project.access.changed': projectChildChangedPayload,
  'pm.project.staffing_plan.changed': projectChildChangedPayload,
  'pm.allocation.created': allocationCreatedPayload,
  'pm.allocation.removed': allocationRemovedPayload,
} as const satisfies Record<string, z.ZodSchema>;
