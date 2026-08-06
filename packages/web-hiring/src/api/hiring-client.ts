async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as {
        message?: string;
        // Zod validation failures (400s from the HTTP layer's safeParse, e.g. VALIDATION errors
        // not routed through a HiringError) carry `details.{form,field}Errors`, not `message`.
        details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
      };
      if (body.message) {
        message = body.message;
      } else if (body.details) {
        const messages = [
          ...(body.details.formErrors ?? []),
          ...Object.values(body.details.fieldErrors ?? {}).flat(),
        ];
        if (messages.length > 0) message = messages.join(' ');
      }
    } catch {
      // ignore parse error
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown) => ({
  method,
  credentials: 'include' as const,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ---- Local types (mirror PR1; web must not import backend) ----
export type ReqStatus = 'open' | 'on_hold' | 'filled' | 'cancelled';
export type ReqStage = 'sourcing' | 'screening' | 'interview' | 'offer';
export type JdVariant = 'internal' | 'external';
export type JdSectionKey = 'about' | 'responsibilities' | 'requirements' | 'nice_to_have';

export interface RequisitionSkillSummary {
  skill_name: string;
  min_level: number | null;
}

export interface RequisitionApplicantSummary {
  name: string;
  role: string | null;
  applied_date: string;
  stage: string;
  kind: string;
  status: string;
}

export interface RequisitionListRow {
  id: string;
  title: string;
  role_title: string | null;
  account_id: string | null;
  account_name: string | null;
  project_id: string | null;
  project_name: string | null;
  grade: string | null;
  kind: string;
  approval_status: string;
  stage: ReqStage;
  status: ReqStatus;
  note: string | null;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  skills: RequisitionSkillSummary[];
  openings_total: number;
  openings_open: number;
  applicants_count: number;
  applicants_internal: number;
  applicants_external: number;
  // Hired applicants are terminal, so they're excluded from the active `applicants` array/counts
  // above; the backend counts them separately for the list's pipeline cell.
  hired_count: number;
  applicants: RequisitionApplicantSummary[];
  version: number;
}
export interface RequisitionRow {
  id: string;
  title: string;
  role_title: string | null;
  grade: string | null;
  account_id: string | null;
  project_id: string | null;
  kind: string;
  approval_status: string;
  status: ReqStatus;
  stage: ReqStage;
  owner_user_id: string | null;
  due_date: string | null;
  start_date: string | null;
  note: string | null;
  default_interview_mode: string | null;
  closed_at: string | null;
  created_at: string;
  version: number;
}
export interface OpeningRow {
  id: string;
  requisition_id: string;
  seq: number;
  status: 'open' | 'filled' | 'closed' | 'cancelled';
  close_reason_id: string | null;
  closed_at: string | null;
  hired_application_id: string | null;
  version: number;
}
export interface JdSectionRow {
  requisition_id: string;
  variant: JdVariant;
  section: JdSectionKey;
  body: string;
}
export interface SkillRow {
  requisition_id: string;
  skill_id: string | null;
  skill_name: string;
  min_level: number | null;
}
export interface ApplicantRow {
  id: string;
  requisition_id: string;
  kind: string;
  candidate_id: string | null;
  worker_id: string | null;
  stage: string | null;
  status: string | null;
  /** From the detail read's candidate join — null for internal applications. */
  candidate_name: string | null;
  candidate_seniority: string | null;
  created_at: string;
}
export interface RequisitionDetail {
  requisition: RequisitionRow;
  account_name: string | null;
  project_name: string | null;
  openings: OpeningRow[];
  jd_sections: JdSectionRow[];
  skills: SkillRow[];
  applicants: ApplicantRow[];
  has_applied: boolean;
  user_application_id: string | null;
}
export interface AccountOption {
  account_id: string;
  name: string;
}
export interface ProjectOption {
  project_id: string;
  account_id: string;
  name: string;
}
export interface JdTemplate {
  template: { id: string; name: string; kind: string; version: number };
  sections: JdSectionRow[];
}
export interface CloseReason {
  id: string;
  label: string;
  active: boolean;
  version: number;
}

export interface OpenRequisitionPayload {
  title: string;
  kind?: 'new' | 'replacement';
  role_title?: string;
  grade?: string;
  account_id?: string;
  project_id?: string;
  due_date?: string;
  start_date?: string;
  note?: string;
  default_interview_mode?: 'online' | 'onsite' | 'either';
  headcount?: number;
  jd_sections?: { variant: JdVariant; section: JdSectionKey; body: string }[];
  // skill_id is required by the backend (hiring.requisition_skill.skill_id is NOT NULL and part
  // of its PK) — always pick from the skill catalog (SkillPicker), never free text.
  skills?: { skill_id: string; skill_name: string; min_level?: number }[];
}
export interface RequisitionPatch {
  title?: string;
  role_title?: string;
  grade?: string;
  account_id?: string;
  project_id?: string;
  kind?: 'new' | 'replacement';
  due_date?: string;
  start_date?: string;
  note?: string;
  default_interview_mode?: 'online' | 'onsite' | 'either';
  stage?: ReqStage;
}

// ---- Reads ----
export async function fetchRequisitions(): Promise<RequisitionListRow[]> {
  const res = await fetch('/api/hiring/v1/requisitions', { credentials: 'include' });
  return (await handleResponse<{ requisitions: RequisitionListRow[] }>(res)).requisitions;
}
// FUT-326/327/328 — the open-positions board: every non-filled requisition the viewer is
// scoped to. `scope: 'all'` for oversight/full-hiring-access viewers, `'scoped'` for
// AM/EM/TL/PM-style viewers scoped to their own accounts and/or projects (scoped_account_names
// / scoped_project_names name what they're scoped to; a viewer can hold both at once).
export interface OpenRequisitionsBoard {
  scope: 'all' | 'scoped';
  scoped_account_names: string[];
  scoped_project_names: string[];
  requisitions: RequisitionListRow[];
}
// FUT-771: the board hides cancelled reqs by default; pass includeCancelled so the Cancelled
// status filter can surface them (the client then narrows the widened set down to cancelled).
export async function fetchOpenRequisitions(
  options: { includeCancelled?: boolean } = {},
): Promise<OpenRequisitionsBoard> {
  const query = options.includeCancelled ? '?include_cancelled=true' : '';
  const res = await fetch(`/api/hiring/v1/requisitions/board${query}`, { credentials: 'include' });
  return handleResponse<OpenRequisitionsBoard>(res);
}
// Backing data for the New Requisition account/project pickers.
export async function fetchAccounts(): Promise<AccountOption[]> {
  const res = await fetch('/api/hiring/v1/accounts', { credentials: 'include' });
  return (await handleResponse<{ accounts: AccountOption[] }>(res)).accounts;
}
export async function fetchProjects(accountId?: string): Promise<ProjectOption[]> {
  const qs = accountId ? `?account_id=${encodeURIComponent(accountId)}` : '';
  const res = await fetch(`/api/hiring/v1/projects${qs}`, { credentials: 'include' });
  return (await handleResponse<{ projects: ProjectOption[] }>(res)).projects;
}
export async function fetchRequisition(id: string): Promise<RequisitionDetail> {
  const res = await fetch(`/api/hiring/v1/requisitions/${id}`, { credentials: 'include' });
  return handleResponse<RequisitionDetail>(res);
}
export async function fetchJdTemplates(): Promise<JdTemplate[]> {
  const res = await fetch('/api/hiring/v1/jd-templates', { credentials: 'include' });
  return (await handleResponse<{ templates: JdTemplate[] }>(res)).templates;
}
export async function fetchCloseReasons(): Promise<CloseReason[]> {
  const res = await fetch('/api/hiring/v1/close-reasons', { credentials: 'include' });
  return (await handleResponse<{ reasons: CloseReason[] }>(res)).reasons;
}

// ---- Mutations ----
export async function openRequisition(
  input: OpenRequisitionPayload,
): Promise<{ requisition_id: string }> {
  return handleResponse(await fetch('/api/hiring/v1/requisitions', json('POST', input)));
}
export async function editRequisition(
  id: string,
  input: { expected_version?: number; patch: RequisitionPatch },
): Promise<{ version: number }> {
  return handleResponse(await fetch(`/api/hiring/v1/requisitions/${id}`, json('PATCH', input)));
}
export async function setRequisitionJd(
  id: string,
  input: { expected_version?: number; sections: JdSectionRow[] },
): Promise<{ version: number }> {
  return handleResponse(await fetch(`/api/hiring/v1/requisitions/${id}/jd`, json('PUT', input)));
}
export async function setRequisitionSkills(
  id: string,
  input: {
    expected_version?: number;
    skills: { skill_id: string; skill_name: string; min_level?: number }[];
  },
): Promise<{ version: number }> {
  return handleResponse(
    await fetch(`/api/hiring/v1/requisitions/${id}/skills`, json('PUT', input)),
  );
}
export async function holdRequisition(
  id: string,
  input: { expected_version?: number },
): Promise<{ version: number }> {
  return handleResponse(await fetch(`/api/hiring/v1/requisitions/${id}/hold`, json('POST', input)));
}
export async function resumeRequisition(
  id: string,
  input: { expected_version?: number },
): Promise<{ version: number }> {
  return handleResponse(
    await fetch(`/api/hiring/v1/requisitions/${id}/resume`, json('POST', input)),
  );
}
export async function closeRequisition(
  id: string,
  input: { expected_version?: number; status: 'filled' | 'cancelled'; close_reason_id?: string },
): Promise<{ version: number }> {
  return handleResponse(
    await fetch(`/api/hiring/v1/requisitions/${id}/close`, json('POST', input)),
  );
}
export async function addOpening(
  id: string,
  input: { resource_request_id?: string; position_id?: string },
): Promise<{ opening_id: string; seq: number }> {
  return handleResponse(
    await fetch(`/api/hiring/v1/requisitions/${id}/openings`, json('POST', input)),
  );
}
export async function closeOpening(
  openingId: string,
  input: { expected_version?: number; status: 'closed' | 'cancelled'; close_reason_id?: string },
): Promise<{ version: number }> {
  return handleResponse(
    await fetch(`/api/hiring/v1/openings/${openingId}/close`, json('POST', input)),
  );
}

// ---- Admin config mutations ----
export interface JdTemplatePayload {
  name: string;
  kind: 'role' | 'intro' | 'closing';
  sections: { variant: JdVariant; section: JdSectionKey; body: string }[];
}

export async function createJdTemplate(input: JdTemplatePayload): Promise<{ template_id: string }> {
  return handleResponse(await fetch('/api/hiring/v1/jd-templates', json('POST', input)));
}
export async function deleteJdTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/hiring/v1/jd-templates/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}
export async function createCloseReason(input: { label: string }): Promise<{ id: string }> {
  return handleResponse(await fetch('/api/hiring/v1/close-reasons', json('POST', input)));
}
export async function archiveCloseReason(
  id: string,
  input: { expected_version?: number },
): Promise<{ version: number }> {
  return handleResponse(
    await fetch(`/api/hiring/v1/close-reasons/${id}/archive`, json('POST', input)),
  );
}

// ---- Candidates (mirror PR2; web must not import backend) ----
export type CandStage = 'new' | 'screening' | 'interview' | 'offer';
export type CandStatus = 'active' | 'hired' | 'rejected' | 'transferred' | 'cancelled';

export interface Fit {
  met: number;
  required: number;
  score: number;
  strong: boolean;
}

export interface CandidateListItem {
  application_id: string;
  candidate_id: string;
  name: string;
  seniority: string | null;
  source: string | null;
  requisition_id: string;
  requisition_title: string;
  requisition_status: string;
  stage: CandStage;
  status: CandStatus;
  rating: number | null;
  version: number;
  applied_at: string;
  skills: CandidateSkillRow[];
  /** The requisition's required skills (name + min level) — backs the card's "n/m skills" hover. */
  required_skills: CandidateSkillRow[];
  fit: Fit;
}

export interface CandidateSkillRow {
  skill_id: string;
  skill_name: string;
  level: number | null;
}
export interface CandidateEvent {
  id: string;
  kind: string;
  summary: string;
  created_at: string;
  actor_user_id: string | null;
}
export interface CandidateApplication {
  application_id: string;
  requisition_id: string;
  requisition_title: string;
  requisition_status: string;
  account_id: string | null;
  stage: CandStage;
  status: CandStatus;
  rating: number | null;
  tags: string[];
  version: number;
  applied_at: string;
  note: string | null;
  fit: Fit;
}
export interface CandidateDetail {
  candidate: {
    id: string;
    name: string;
    source: string | null;
    seniority: string | null;
    segment: string | null;
    dob: string | null;
    gender: string | null;
    cv_storage_key: string | null;
    contact: { personal_email?: string; phone?: string } | null;
    version: number;
  };
  applications: CandidateApplication[];
  skills: CandidateSkillRow[];
  timeline: CandidateEvent[];
}

export type RejectionCategory = 'rejected_by_us' | 'withdrew' | 'other';
export interface RejectionReason {
  id: string;
  label: string;
  category: RejectionCategory;
  active: boolean;
  version: number;
}
export interface CatalogSkill {
  id: string;
  name: string;
  category_id: string;
  active: boolean;
}
export interface CatalogCategory {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
}
export interface SkillCatalog {
  categories: CatalogCategory[];
  skills: CatalogSkill[];
}

export interface AddCandidatePayload {
  requisition_id: string;
  name: string;
  personal_email?: string;
  email?: string;
  phone?: string;
  dob?: string;
  gender?: string;
  seniority?: string;
  source?: string;
  note?: string;
  skills: { skill_id: string; skill_name: string; level?: number }[];
}

export interface CandidateStageCounts {
  new: number;
  screening: number;
  interview: number;
  offer: number;
  hired: number;
  cancelled: number;
}

// ---- Candidate reads ----
// FUT-833: optional `q` searches candidate-owned fields (name, contact email/phone) server-side,
// so contact PII never rides the full list payload. The query-keys layer keys the cache by `q`.
function withQ(url: string, q?: string): string {
  return q ? `${url}?q=${encodeURIComponent(q)}` : url;
}
export async function fetchCandidates(q?: string): Promise<CandidateListItem[]> {
  const res = await fetch(withQ('/api/hiring/v1/candidates', q), { credentials: 'include' });
  return (await handleResponse<{ candidates: CandidateListItem[] }>(res)).candidates;
}
// Rejected applications — backs the board's read-only "Rejected" column (kept out of
// fetchCandidates so the active pipeline stays active+hired only).
export async function fetchRejectedCandidates(q?: string): Promise<CandidateListItem[]> {
  const res = await fetch(withQ('/api/hiring/v1/candidates/rejected', q), {
    credentials: 'include',
  });
  return (await handleResponse<{ candidates: CandidateListItem[] }>(res)).candidates;
}
export async function fetchCandidateStageCounts(): Promise<CandidateStageCounts> {
  const res = await fetch('/api/hiring/v1/candidates/stage-counts', { credentials: 'include' });
  return handleResponse<CandidateStageCounts>(res);
}
export async function fetchCandidate(id: string): Promise<CandidateDetail> {
  const res = await fetch(`/api/hiring/v1/candidates/${id}`, { credentials: 'include' });
  return handleResponse<CandidateDetail>(res);
}
export async function fetchRejectionReasons(): Promise<RejectionReason[]> {
  const res = await fetch('/api/hiring/v1/rejection-reasons', { credentials: 'include' });
  return (await handleResponse<{ reasons: RejectionReason[] }>(res)).reasons;
}
export async function createRejectionReason(input: {
  label: string;
  category: RejectionCategory;
}): Promise<{ id: string }> {
  return handleResponse(await fetch('/api/hiring/v1/rejection-reasons', json('POST', input)));
}
export async function archiveRejectionReason(
  id: string,
  input: { expected_version?: number },
): Promise<{ version: number }> {
  return handleResponse(
    await fetch(`/api/hiring/v1/rejection-reasons/${id}/archive`, json('POST', input)),
  );
}
export async function fetchSkillCatalog(): Promise<SkillCatalog> {
  const [catsRes, skillsRes] = await Promise.all([
    fetch('/api/identity/v1/skill-categories', { credentials: 'include' }),
    fetch('/api/identity/v1/skills', { credentials: 'include' }),
  ]);
  const categories = (await handleResponse<{ categories: CatalogCategory[] }>(catsRes)).categories;
  const skills = (await handleResponse<{ skills: CatalogSkill[] }>(skillsRes)).skills;
  return { categories, skills };
}

// ---- Candidate mutations ----
export async function addCandidate(
  input: AddCandidatePayload,
): Promise<{ candidate_id: string; application_id: string }> {
  return handleResponse(await fetch('/api/hiring/v1/candidates', json('POST', input)));
}
export async function editCandidate(
  id: string,
  input: {
    patch: {
      name?: string;
      note?: string;
      seniority?: string;
      source?: string;
      segment?: string;
      personal_email?: string;
      phone?: string;
      cv_storage_key?: string | null;
      cv_sha256?: string | null;
    };
  },
): Promise<{ ok: true }> {
  return handleResponse(await fetch(`/api/hiring/v1/candidates/${id}`, json('PATCH', input)));
}
export async function setCandidateSkills(
  id: string,
  input: { skills: { skill_id: string; skill_name: string; level?: number }[] },
): Promise<{ ok: true }> {
  return handleResponse(await fetch(`/api/hiring/v1/candidates/${id}/skills`, json('PUT', input)));
}
export async function moveApplicationStage(
  applicationId: string,
  input: { expected_version?: number; to: CandStage },
): Promise<{ version: number }> {
  return handleResponse(
    await fetch(`/api/hiring/v1/applications/${applicationId}/stage`, json('POST', input)),
  );
}
export async function hireApplication(
  applicationId: string,
  input: { expected_version?: number },
): Promise<{ version: number }> {
  return handleResponse(
    await fetch(`/api/hiring/v1/applications/${applicationId}/hire`, json('POST', input)),
  );
}
export async function setApplicationRating(
  applicationId: string,
  input: { expected_version?: number; rating: number },
): Promise<{ version: number }> {
  return handleResponse(
    await fetch(`/api/hiring/v1/applications/${applicationId}/rating`, json('POST', input)),
  );
}
export async function rejectApplication(
  applicationId: string,
  input: { expected_version?: number; reason: string; reason_id?: string; tags?: string[] },
): Promise<{ version: number }> {
  const { expected_version, ...reasonInput } = input;
  return handleResponse(
    await fetch(
      `/api/hiring/v1/applications/${applicationId}/reject`,
      json('POST', { input: reasonInput, expected_version }),
    ),
  );
}
export async function transferApplication(
  applicationId: string,
  input: { expected_version?: number; target_requisition_id: string },
): Promise<{ version: number; to_application_id: string }> {
  const { expected_version, ...transferInput } = input;
  return handleResponse(
    await fetch(
      `/api/hiring/v1/applications/${applicationId}/transfer`,
      json('POST', { input: transferInput, expected_version }),
    ),
  );
}

// ---- Talent pool (PR4) ----
export interface TalentPoolFit {
  met: number;
  required: number;
  score: number;
  strong: boolean;
}
export interface TalentPoolRecommendation {
  requisition_id: string;
  title: string;
  fit: TalentPoolFit;
}
export interface TalentPoolRow {
  candidate_id: string;
  name: string;
  seniority: string | null;
  segment: string | null;
  last_status: string | null;
  recommended: TalentPoolRecommendation[];
}

export async function fetchTalentPool(q?: string): Promise<TalentPoolRow[]> {
  const res = await fetch(withQ('/api/hiring/v1/talent-pool', q), { credentials: 'include' });
  return (await handleResponse<{ pool: TalentPoolRow[] }>(res)).pool;
}

// ---- CV parse & storage ----

export interface CandidateCvDraft {
  name: string | null;
  personal_email: string | null;
  phone: string | null;
  dob: string | null;
  gender: 'male' | 'female' | null;
  seniority: string | null;
  note: string | null;
  skills: Array<{ skill_id: string; skill_name: string }>;
  skill_suggestions: string[];
  cv_sha256: string;
  possible_duplicates: CandidateDuplicate[];
}

export interface CandidateDuplicate {
  candidate_id: string;
  name: string;
  created_at: string;
  match: 'file' | 'email' | 'phone';
}

/** Stateless parse: nothing is stored until the recruiter saves the form. */
export async function parseCandidateCvDraft(
  file: File,
  signal?: AbortSignal,
): Promise<CandidateCvDraft> {
  const fd = new FormData();
  fd.set('file', file);
  const res = await fetch('/api/hiring/v1/cv/parse-draft', {
    method: 'POST',
    credentials: 'include',
    body: fd,
    signal,
  });
  return (await handleResponse<{ draft: CandidateCvDraft }>(res)).draft;
}

export async function requestCandidateCvUpload(
  candidateId: string,
  filename: string,
  contentType: string,
): Promise<{ upload_url: string; s3_key: string }> {
  const res = await fetch(`/api/hiring/v1/candidates/${candidateId}/cv/upload-url`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, content_type: contentType }),
  });
  return handleResponse<{ upload_url: string; s3_key: string }>(res);
}

export async function getCandidateCvDownloadUrl(candidateId: string): Promise<string> {
  const res = await fetch(`/api/hiring/v1/candidates/${candidateId}/cv/download-url`, {
    credentials: 'include',
  });
  return (await handleResponse<{ download_url: string }>(res)).download_url;
}

export async function putCvToS3(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!res.ok) throw new Error(`CV upload failed: HTTP ${res.status}`);
}

export async function applyInternalRequisition(
  requisitionId: string,
  note?: string,
): Promise<{ candidate_id: string; application_id: string }> {
  const res = await fetch(
    `/api/hiring/v1/requisitions/${requisitionId}/apply`,
    json('POST', { note }),
  );
  return handleResponse<{ candidate_id: string; application_id: string }>(res);
}
