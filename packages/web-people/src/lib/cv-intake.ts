import type { CreateWorkerInput, WorkerCvDraft } from '../api/people-client.ts';

/** Controlled values of the create-worker form (all strings; '' = empty). */
export interface WorkerFormValues {
  full_name: string;
  personal_email: string;
  phone: string;
  dob: string;
  gender: string;
  job_title: string;
  work_email: string;
  employment_type: string;
  start_date: string;
  employee_no: string;
  org_unit_id: string;
}

export const EMPTY_WORKER_FORM: WorkerFormValues = {
  full_name: '',
  personal_email: '',
  phone: '',
  dob: '',
  gender: '',
  job_title: '',
  work_email: '',
  employment_type: '',
  start_date: '',
  employee_no: '',
  org_unit_id: '',
};

/**
 * Merge a parsed CV draft into the form: fills only fields the user has not
 * typed into — a parse never overwrites human input (PRD review-first rule).
 */
export function applyDraftToForm(
  draft: WorkerCvDraft,
  current: WorkerFormValues,
): WorkerFormValues {
  const pick = (curr: string, parsed: string | null): string =>
    curr.trim() !== '' ? curr : (parsed ?? '');
  return {
    ...current,
    full_name: pick(current.full_name, draft.full_name),
    personal_email: pick(current.personal_email, draft.personal_email),
    phone: pick(current.phone, draft.phone),
    dob: pick(current.dob, draft.dob),
    gender: pick(current.gender, draft.gender),
    job_title: pick(current.job_title, draft.job_title),
  };
}

export type WorkerFormErrors = Partial<
  Record<'full_name' | 'personal_email' | 'work_email', string>
>;

/** Loose shape check only — the createWorker contract (zod .email()) stays the authority. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Client-side mirror of the createWorker contract's hard failures: required
 * full_name and email shape. Everything else in the form is optional or
 * constrained by its control (Selector, DateInput, Typeahead).
 */
export function validateWorkerForm(form: WorkerFormValues): WorkerFormErrors {
  const errors: WorkerFormErrors = {};
  if (form.full_name.trim() === '') errors.full_name = 'Full name is required.';
  for (const field of ['personal_email', 'work_email'] as const) {
    const value = form[field].trim();
    if (value !== '' && !EMAIL_SHAPE.test(value)) {
      errors[field] = 'Enter a valid email address.';
    }
  }
  return errors;
}

export function formToCreateInput(form: WorkerFormValues): CreateWorkerInput {
  const opt = (v: string): string | undefined => (v.trim() === '' ? undefined : v.trim());
  return {
    full_name: form.full_name.trim(),
    personal_email: opt(form.personal_email),
    phone: opt(form.phone),
    dob: opt(form.dob),
    gender: opt(form.gender),
    job_title: opt(form.job_title),
    work_email: opt(form.work_email),
    employment_type: opt(form.employment_type),
    start_date: opt(form.start_date),
    employee_no: opt(form.employee_no),
    org_unit_id: opt(form.org_unit_id),
  };
}

export interface SaveWorkerDeps {
  createWorker: (input: CreateWorkerInput) => Promise<{ worker_id: string }>;
  addWorkerSkill: (workerId: string, skillId: string) => Promise<unknown>;
  requestCvUpload: (
    workerId: string,
    filename: string,
    contentType: string,
  ) => Promise<{ upload_url: string; s3_key: string }>;
  putToS3: (url: string, file: File) => Promise<void>;
  patchWorker: (workerId: string, patch: { cv_storage_key: string }) => Promise<unknown>;
}

export interface SaveWorkerResult {
  worker_id: string;
  /** Non-fatal follow-up failures (skills/CV) — the worker itself was created. */
  warnings: string[];
}

/**
 * Save order is deliberate: worker first (data outlives files), then skills,
 * then the CV (presign → PUT → patch key). Skill/CV failures degrade to
 * warnings so a created worker is never lost to a flaky upload.
 */
export async function saveWorkerWithCv(
  deps: SaveWorkerDeps,
  args: { form: WorkerFormValues; skillIds: string[]; cvFile: File | null },
): Promise<SaveWorkerResult> {
  const { worker_id } = await deps.createWorker(formToCreateInput(args.form));
  const warnings: string[] = [];

  if (args.skillIds.length > 0) {
    const results = await Promise.allSettled(
      args.skillIds.map((id) => deps.addWorkerSkill(worker_id, id)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) warnings.push(`${failed} skill(s) could not be added`);
  }

  if (args.cvFile) {
    try {
      const { upload_url, s3_key } = await deps.requestCvUpload(
        worker_id,
        args.cvFile.name,
        args.cvFile.type || 'application/octet-stream',
      );
      await deps.putToS3(upload_url, args.cvFile);
      await deps.patchWorker(worker_id, { cv_storage_key: s3_key });
    } catch (e) {
      warnings.push(`CV was not attached: ${(e as Error).message}`);
    }
  }

  return { worker_id, warnings };
}
