import { z } from 'zod';

const uuid = z.string().uuid();

export const requisitionOpenedPayload = z.object({ requisition_id: uuid, tenant_id: uuid });
export const requisitionUpdatedPayload = z.object({
  requisition_id: uuid,
  tenant_id: uuid,
  fields: z.array(z.string()),
});
export const requisitionClosedPayload = z.object({
  requisition_id: uuid,
  tenant_id: uuid,
  status: z.enum(['filled', 'cancelled']),
});
export const openingOpenedPayload = z.object({
  opening_id: uuid,
  requisition_id: uuid,
  tenant_id: uuid,
  resource_request_id: uuid.optional(),
});
export const openingClosedPayload = z.object({
  opening_id: uuid,
  requisition_id: uuid,
  tenant_id: uuid,
  status: z.enum(['closed', 'cancelled']),
  reason_id: uuid.optional(),
});

export const HIRING_REQUISITION_OPENED = 'hiring.requisition.opened';
export const HIRING_REQUISITION_UPDATED = 'hiring.requisition.updated';
export const HIRING_REQUISITION_CLOSED = 'hiring.requisition.closed';
export const HIRING_OPENING_OPENED = 'hiring.opening.opened';
export const HIRING_OPENING_CLOSED = 'hiring.opening.closed';

export const candidateAddedPayload = z.object({ candidate_id: uuid, tenant_id: uuid });
export const candidateUpdatedPayload = z.object({
  candidate_id: uuid,
  tenant_id: uuid,
  fields: z.array(z.string()),
});
export const applicationCreatedPayload = z.object({
  application_id: uuid,
  candidate_id: uuid,
  requisition_id: uuid,
  tenant_id: uuid,
});
export const applicationUpdatedPayload = z.object({
  application_id: uuid,
  tenant_id: uuid,
  fields: z.array(z.string()),
});
export const applicationStageChangedPayload = z.object({
  application_id: uuid,
  tenant_id: uuid,
  from: z.string(),
  to: z.string(),
});
export const applicationRejectedPayload = z.object({
  application_id: uuid,
  tenant_id: uuid,
  reason_id: uuid,
  category: z.enum(['rejected_by_us', 'withdrew', 'other']),
});
export const applicationTransferredPayload = z.object({
  application_id: uuid,
  to_application_id: uuid,
  target_requisition_id: uuid,
  tenant_id: uuid,
});
export const applicationHiredPayload = z.object({
  application_id: uuid,
  tenant_id: uuid,
  from_stage: z.string(),
});
export const applicationCancelledPayload = z.object({
  application_id: uuid,
  tenant_id: uuid,
  requisition_id: uuid,
  from_stage: z.string(),
});

export const HIRING_CANDIDATE_ADDED = 'hiring.candidate.added';
export const HIRING_CANDIDATE_UPDATED = 'hiring.candidate.updated';
export const HIRING_APPLICATION_CREATED = 'hiring.application.created';
export const HIRING_APPLICATION_UPDATED = 'hiring.application.updated';
export const HIRING_APPLICATION_STAGE_CHANGED = 'hiring.application.stage_changed';
export const HIRING_APPLICATION_REJECTED = 'hiring.application.rejected';
export const HIRING_APPLICATION_TRANSFERRED = 'hiring.application.transferred';
export const HIRING_APPLICATION_HIRED = 'hiring.application.hired';
export const HIRING_APPLICATION_CANCELLED = 'hiring.application.cancelled';

// ---- Interviews (FUT-487) ----
export const interviewScheduledPayload = z.object({
  interview_id: uuid,
  application_id: uuid,
  candidate_id: uuid,
  tenant_id: uuid,
});
export const interviewRescheduledPayload = z.object({
  interview_id: uuid,
  application_id: uuid,
  tenant_id: uuid,
});
export const interviewOutcomePayload = z.object({
  interview_id: uuid,
  application_id: uuid,
  tenant_id: uuid,
  status: z.enum(['completed', 'cancelled', 'no_show']),
});

export const HIRING_INTERVIEW_SCHEDULED = 'hiring.interview.scheduled';
export const HIRING_INTERVIEW_RESCHEDULED = 'hiring.interview.rescheduled';
export const HIRING_INTERVIEW_OUTCOME_RECORDED = 'hiring.interview.outcome_recorded';

export const HIRING_EVENTS = {
  [HIRING_REQUISITION_OPENED]: requisitionOpenedPayload,
  [HIRING_REQUISITION_UPDATED]: requisitionUpdatedPayload,
  [HIRING_REQUISITION_CLOSED]: requisitionClosedPayload,
  [HIRING_OPENING_OPENED]: openingOpenedPayload,
  [HIRING_OPENING_CLOSED]: openingClosedPayload,
  [HIRING_CANDIDATE_ADDED]: candidateAddedPayload,
  [HIRING_CANDIDATE_UPDATED]: candidateUpdatedPayload,
  [HIRING_APPLICATION_CREATED]: applicationCreatedPayload,
  [HIRING_APPLICATION_UPDATED]: applicationUpdatedPayload,
  [HIRING_APPLICATION_STAGE_CHANGED]: applicationStageChangedPayload,
  [HIRING_APPLICATION_REJECTED]: applicationRejectedPayload,
  [HIRING_APPLICATION_TRANSFERRED]: applicationTransferredPayload,
  [HIRING_APPLICATION_HIRED]: applicationHiredPayload,
  [HIRING_APPLICATION_CANCELLED]: applicationCancelledPayload,
  [HIRING_INTERVIEW_SCHEDULED]: interviewScheduledPayload,
  [HIRING_INTERVIEW_RESCHEDULED]: interviewRescheduledPayload,
  [HIRING_INTERVIEW_OUTCOME_RECORDED]: interviewOutcomePayload,
} as const satisfies Record<string, z.ZodSchema>;
