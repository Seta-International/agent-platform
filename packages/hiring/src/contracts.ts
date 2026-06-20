import { z } from 'zod';

export const jdVariant = z.enum(['internal', 'external']);
export const jdSectionKey = z.enum(['about', 'responsibilities', 'requirements', 'nice_to_have']);
export const interviewMode = z.enum(['online', 'onsite', 'either']);

export const jdSectionInput = z.object({
  variant: jdVariant,
  section: jdSectionKey,
  body: z.string(),
});
export type JdSectionInput = z.infer<typeof jdSectionInput>;

export const skillInput = z.object({
  skill_name: z.string().min(1),
  skill_id: z.string().uuid().optional(),
  min_level: z.number().int().min(0).max(5).optional(),
});
export type SkillInput = z.infer<typeof skillInput>;

export const openRequisitionInput = z.object({
  title: z.string().min(1),
  kind: z.enum(['replacement', 'new']).default('new'),
  role_title: z.string().optional(),
  grade: z.string().optional(),
  account_id: z.string().uuid().optional(),
  due_date: z.string().optional(),
  start_date: z.string().optional(),
  note: z.string().optional(),
  default_interview_mode: interviewMode.optional(),
  headcount: z.number().int().min(1).default(1),
  jd_sections: z.array(jdSectionInput).optional(),
  skills: z.array(skillInput).optional(),
});
export type OpenRequisitionInput = z.infer<typeof openRequisitionInput>;

export const editRequisitionPatch = z
  .object({
    title: z.string().min(1),
    role_title: z.string(),
    grade: z.string(),
    account_id: z.string().uuid(),
    kind: z.enum(['replacement', 'new']),
    due_date: z.string(),
    start_date: z.string(),
    note: z.string(),
    default_interview_mode: interviewMode,
    stage: z.enum(['sourcing', 'screening', 'interview', 'offer']),
  })
  .partial();
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

export const closeRequisitionInput = z.object({ status: z.enum(['filled', 'cancelled']) });
export type CloseRequisitionInput = z.infer<typeof closeRequisitionInput>;

export const jdTemplateInput = z.object({
  name: z.string().min(1),
  kind: z.enum(['role', 'intro', 'closing']),
  sections: z.array(jdSectionInput),
});
export type JdTemplateInput = z.infer<typeof jdTemplateInput>;

export const closeReasonInput = z.object({ label: z.string().min(1) });
export type CloseReasonInput = z.infer<typeof closeReasonInput>;
