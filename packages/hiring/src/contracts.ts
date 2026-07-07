import { z } from 'zod';

export const jdVariant = z.enum(['internal', 'external']);
export const jdSectionKey = z.enum(['about', 'responsibilities', 'requirements', 'nice_to_have']);
export const interviewMode = z.enum(['online', 'onsite', 'either']);
export const genderValue = z.enum(['male', 'female', 'prefer_not_to_say']);

export const jdSectionInput = z.object({
  variant: jdVariant,
  section: jdSectionKey,
  body: z.string(),
});
export type JdSectionInput = z.infer<typeof jdSectionInput>;

export const skillInput = z.object({
  skill_name: z.string().min(1),
  skill_id: z.string().uuid(),
  min_level: z.number().int().min(0).max(5).optional(),
});
export type SkillInput = z.infer<typeof skillInput>;

export const openRequisitionInput = z
  .object({
    title: z.string().min(1),
    kind: z.enum(['replacement', 'new']).default('new'),
    role_title: z.string().optional(),
    grade: z.string().optional(),
    account_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
    due_date: z.string().optional(),
    start_date: z.string().optional(),
    note: z.string().optional(),
    default_interview_mode: interviewMode.optional(),
    headcount: z.number().int().min(1).default(1),
    jd_sections: z.array(jdSectionInput).optional(),
    skills: z.array(skillInput).optional(),
  })
  .refine((data) => !data.start_date || !data.due_date || data.start_date < data.due_date, {
    message: 'start_date must be before due_date',
    path: ['start_date'],
  });
export type OpenRequisitionInput = z.input<typeof openRequisitionInput>;

export const editRequisitionPatch = z
  .object({
    title: z.string().min(1),
    role_title: z.string(),
    grade: z.string(),
    account_id: z.string().uuid(),
    project_id: z.string().uuid(),
    kind: z.enum(['replacement', 'new']),
    due_date: z.string(),
    start_date: z.string(),
    note: z.string(),
    default_interview_mode: interviewMode,
    stage: z.enum(['sourcing', 'screening', 'interview', 'offer']),
  })
  .partial()
  // Only catches a patch that sets both fields at once — a patch touching just one of them is
  // checked against the stored counterpart in edit-requisition.ts, which has the current row.
  .refine((data) => !data.start_date || !data.due_date || data.start_date < data.due_date, {
    message: 'start_date must be before due_date',
    path: ['start_date'],
  });
export type EditRequisitionPatch = z.infer<typeof editRequisitionPatch>;

export const addOpeningInput = z.object({
  resource_request_id: z.string().uuid().optional(),
  position_id: z.string().uuid().optional(),
});
export type AddOpeningInput = z.infer<typeof addOpeningInput>;

export const closeOpeningInput = z.object({
  status: z.enum(['closed', 'cancelled']),
  close_reason_id: z.string().uuid().optional(),
});
export type CloseOpeningInput = z.infer<typeof closeOpeningInput>;

export const closeRequisitionInput = z
  .object({
    status: z.enum(['filled', 'cancelled']),
    close_reason_id: z.string().uuid().optional(),
  })
  .refine((data) => data.status !== 'cancelled' || !!data.close_reason_id, {
    message: 'close_reason_id is required when cancelling',
    path: ['close_reason_id'],
  });
export type CloseRequisitionInput = z.infer<typeof closeRequisitionInput>;

export const jdTemplateInput = z.object({
  name: z.string().min(1),
  kind: z.enum(['role', 'intro', 'closing']),
  sections: z.array(jdSectionInput),
});
export type JdTemplateInput = z.infer<typeof jdTemplateInput>;

export const closeReasonInput = z.object({ label: z.string().min(1) });
export type CloseReasonInput = z.infer<typeof closeReasonInput>;

export const applicationStage = z.enum(['new', 'screening', 'interview', 'offer']);

export const candidateSkillInput = z.object({
  skill_id: z.string().uuid(),
  skill_name: z.string().min(1),
  level: z.number().int().min(0).max(5).optional(),
});
export type CandidateSkillInput = z.infer<typeof candidateSkillInput>;

export const addCandidateInput = z.object({
  requisition_id: z.string().uuid(),
  name: z.string().min(1),
  personal_email: z.string().email().optional(),
  phone: z.string().optional(),
  dob: z.string().optional(),
  gender: genderValue.optional(),
  seniority: z.string().optional(),
  source: z.string().optional(),
  segment: z.string().optional(),
  note: z.string().optional(),
  skills: z.array(candidateSkillInput).default([]),
});
export type AddCandidateInput = z.input<typeof addCandidateInput>;

export const editCandidatePatch = z
  .object({
    name: z.string().min(1),
    personal_email: z.string().email(),
    cv_storage_key: z.string().min(1).nullable(),
    phone: z.string(),
    dob: z.string(),
    gender: genderValue,
    seniority: z.string(),
    source: z.string(),
    segment: z.string(),
    note: z.string(),
  })
  .partial();
export type EditCandidatePatch = z.infer<typeof editCandidatePatch>;

export const rejectApplicationInput = z.object({
  reason_id: z.string().uuid(),
  tags: z.array(z.string()).default([]),
  note: z.string().optional(),
});
export type RejectApplicationInput = z.infer<typeof rejectApplicationInput>;

export const transferApplicationInput = z.object({
  target_requisition_id: z.string().uuid(),
});
export type TransferApplicationInput = z.infer<typeof transferApplicationInput>;

export const rejectionReasonInput = z.object({
  label: z.string().min(1),
  category: z.enum(['rejected_by_us', 'withdrew', 'other']),
});
export type RejectionReasonInput = z.infer<typeof rejectionReasonInput>;
