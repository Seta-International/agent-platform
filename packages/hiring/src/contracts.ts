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

export const MAX_JOB_TITLE_LENGTH = 100;

export const openRequisitionInput = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Job title is required.')
      .max(MAX_JOB_TITLE_LENGTH, `Job title cannot exceed ${MAX_JOB_TITLE_LENGTH} characters.`),
    kind: z.enum(['replacement', 'new']).default('new'),
    role_title: z.string().optional(),
    grade: z.string().optional(),
    account_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
    due_date: z.string().optional(),
    start_date: z.string().optional(),
    note: z.string().optional(),
    default_interview_mode: interviewMode.optional(),
    headcount: z.number().int().min(1).max(9).default(1),
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
    title: z
      .string()
      .trim()
      .min(1, 'Job title is required.')
      .max(MAX_JOB_TITLE_LENGTH, `Job title cannot exceed ${MAX_JOB_TITLE_LENGTH} characters.`),
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

export const applyInternalInput = z.object({
  note: z.string().optional(),
});
export type ApplyInternalInput = z.infer<typeof applyInternalInput>;

export const jdTemplateInput = z.object({
  name: z.string().min(1),
  kind: z.enum(['role', 'intro', 'closing']),
  sections: z.array(jdSectionInput),
});
export type JdTemplateInput = z.infer<typeof jdTemplateInput>;

export const closeReasonInput = z.object({ label: z.string().min(1) });
export type CloseReasonInput = z.infer<typeof closeReasonInput>;

export const applicationStage = z.enum(['new', 'screening', 'interview', 'offer']);

export const NAME_ERROR_MESSAGE = 'Full name must be a valid person name.';

function normalizeName(value: string) {
  return value.normalize('NFC').replace(/\s+/g, ' ').replace(/‐/g, '-').trim();
}

const NAME_RE = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u;

const nameString = z
  .string()
  .transform(normalizeName)
  .pipe(z.string().min(1).max(100).regex(NAME_RE, NAME_ERROR_MESSAGE));

export { NAME_RE, nameString, normalizeName };

export const candidateSkillInput = z.object({
  skill_id: z.string().uuid(),
  skill_name: z.string().min(1),
  level: z.number().int().min(0).max(5).optional(),
});
export type CandidateSkillInput = z.infer<typeof candidateSkillInput>;

export const PHONE_REGEX = /^\+?[0-9()\-.\s]{7,25}$/;

export const candidatePhoneSchema = z
  .string()
  .trim()
  .refine(
    (v) => {
      if (!v) return true;
      if (!PHONE_REGEX.test(v)) return false;
      const digits = v.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15;
    },
    {
      message: 'Invalid phone number format',
    },
  )
  .optional();

// Reusable DOB validator — valid calendar date, not future, age 18-99.
// Use YYYY-MM-DD string; manual part-check catches JS auto-correction (e.g. Feb 31 → Mar 3).
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
export const dobSchema = z
  .string()
  .refine((v) => dateRegex.test(v), { message: 'Invalid date format' })
  .refine(
    (v) => {
      const parts = v.split('-').map(Number) as [number, number, number];
      const [y, m, d] = parts;
      const date = new Date(y, m - 1, d);
      return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
    },
    { message: 'Invalid calendar date (e.g. Feb 31 does not exist)' },
  )
  .refine(
    (v) => {
      const parts = v.split('-').map(Number) as [number, number, number];
      const [y, m, d] = parts;
      const entered = new Date(y, m - 1, d);
      const todayLocal = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        new Date().getDate(),
      );
      return entered < todayLocal;
    },
    { message: 'Date of birth cannot be in the future' },
  )
  .refine(
    (v) => {
      const parts = v.split('-').map(Number) as [number, number, number];
      const [y, m, d] = parts;
      const entered = new Date(y, m - 1, d);
      const age = Math.floor((Date.now() - entered.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      return age >= 18 && age < 100;
    },
    { message: 'Candidate must be at least 18 and under 100 years old' },
  );

export const addCandidateInput = z.object({
  requisition_id: z.string().uuid(),
  name: nameString,
  personal_email: z.string().email().optional(),
  phone: candidatePhoneSchema,
  dob: dobSchema.optional(),
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
    name: nameString,
    personal_email: z.string().email(),
    cv_storage_key: z.string().min(1).nullable(),
    cv_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    phone: candidatePhoneSchema,
    dob: dobSchema,
    gender: genderValue,
    seniority: z.string(),
    source: z.string(),
    segment: z.string(),
    note: z.string(),
  })
  .partial();
export type EditCandidatePatch = z.infer<typeof editCandidatePatch>;

export const rejectApplicationInput = z.object({
  /** Free-text reason typed by the recruiter — the dialog's single required field. */
  reason: z.string().trim().min(1, 'reason is required'),
  /** Optional catalog classification; when absent the event categorizes as 'other'. */
  reason_id: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
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

// ---- Interviews (FUT-487) ----
export const interviewEventMode = z.enum(['online', 'onsite']);
export const interviewResult = z.enum(['pass', 'hold', 'fail']);

export const interviewPanelistInput = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().trim().min(1),
});
export type InterviewPanelistInput = z.infer<typeof interviewPanelistInput>;

const interviewScheduleFields = {
  scheduled_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'scheduled_at must be a valid date',
  }),
  duration_minutes: z.number().int().min(15).max(240),
  mode: interviewEventMode,
  meeting_link: z.string().trim().max(2000).optional(),
  note: z.string().optional(),
  panel: z.array(interviewPanelistInput).default([]),
};

export const scheduleInterviewInput = z.object({
  application_id: z.string().uuid(),
  ...interviewScheduleFields,
});
export type ScheduleInterviewInput = z.infer<typeof scheduleInterviewInput>;

export const rescheduleInterviewInput = z.object(interviewScheduleFields);
export type RescheduleInterviewInput = z.infer<typeof rescheduleInterviewInput>;

export const completeInterviewInput = z.object({
  result: interviewResult,
  feedback_note: z.string().optional(),
});
export type CompleteInterviewInput = z.infer<typeof completeInterviewInput>;

// Shared by cancel/no-show — the frontend's reason field is optional for both (a recruiter may
// not always have (or need) a reason to give).
export const interviewOutcomeReasonInput = z.object({
  outcome_reason: z.string().trim().optional(),
});
export type InterviewOutcomeReasonInput = z.infer<typeof interviewOutcomeReasonInput>;
