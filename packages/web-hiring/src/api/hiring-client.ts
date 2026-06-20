async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
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

export interface RequisitionListRow {
  id: string;
  title: string;
  account_id: string | null;
  grade: string | null;
  kind: string;
  stage: ReqStage;
  status: ReqStatus;
  due_date: string | null;
  openings_total: number;
  openings_open: number;
  applicants_count: number;
  version: number;
}
export interface RequisitionRow {
  id: string;
  title: string;
  role_title: string | null;
  grade: string | null;
  account_id: string | null;
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
}
export interface RequisitionDetail {
  requisition: RequisitionRow;
  openings: OpeningRow[];
  jd_sections: JdSectionRow[];
  skills: SkillRow[];
  applicants: ApplicantRow[];
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
  due_date?: string;
  start_date?: string;
  note?: string;
  default_interview_mode?: 'online' | 'onsite' | 'either';
  headcount?: number;
  jd_sections?: { variant: JdVariant; section: JdSectionKey; body: string }[];
  skills?: { skill_name: string; skill_id?: string; min_level?: number }[];
}
export interface RequisitionPatch {
  title?: string;
  role_title?: string;
  grade?: string;
  account_id?: string;
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
    skills: { skill_name: string; skill_id?: string; min_level?: number }[];
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
  input: { expected_version?: number; status: 'filled' | 'cancelled' },
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
