export interface AccountListRow {
  account_id: string;
  name: string;
  industry: string | null;
  am_worker_id: string | null;
  recruiter_count: number;
  project_count: number;
}

export interface AccountDetail {
  account_id: string;
  name: string;
  industry: string | null;
  am_worker_id: string | null;
  version: number;
  recruiter_worker_ids: string[];
}

export interface AccountPatch {
  name?: string;
  industry?: string | null;
  am_worker_id?: string | null;
}

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

export async function fetchAccounts(): Promise<AccountListRow[]> {
  const res = await fetch('/api/pm/v1/accounts', { credentials: 'include' });
  const body = await handleResponse<{ accounts: AccountListRow[] }>(res);
  return body.accounts;
}

export async function fetchAccount(id: string): Promise<AccountDetail> {
  const res = await fetch(`/api/pm/v1/accounts/${id}`, { credentials: 'include' });
  return handleResponse<AccountDetail>(res);
}

export async function createAccount(input: {
  name: string;
  industry?: string;
  am_worker_id?: string;
  recruiter_worker_ids?: string[];
}): Promise<{ account_id: string }> {
  const res = await fetch('/api/pm/v1/accounts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ account_id: string }>(res);
}

export async function editAccount(
  id: string,
  input: { expected_version?: number; patch: AccountPatch },
): Promise<{ version: number }> {
  const res = await fetch(`/api/pm/v1/accounts/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ version: number }>(res);
}

export async function setAccountRecruiters(
  id: string,
  recruiter_worker_ids: string[],
): Promise<{ added: number; removed: number }> {
  const res = await fetch(`/api/pm/v1/accounts/${id}/recruiters`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recruiter_worker_ids }),
  });
  return handleResponse<{ added: number; removed: number }>(res);
}

export type CharterStatus = 'submitted' | 'pmo_approved' | 'approved' | 'rejected' | 'withdrawn';

export interface CharterListRow {
  charter_id: string;
  account_id: string;
  name: string;
  status: CharterStatus;
  rejected_stage: 'pmo' | 'bod' | null;
  pm_worker_id: string | null;
  budget_bmm: string | null;
  team_size: number | null;
  methodology: 'scrum' | 'kanban' | null;
  pricing_model: 'fixed_price' | 'time_materials' | null;
  created_at: string;
}

export interface CharterDetail {
  charter_id: string;
  account_id: string;
  name: string;
  pm_worker_id: string | null;
  pmo_worker_id: string | null;
  budget_bmm: string | null;
  team_size: number | null;
  methodology: 'scrum' | 'kanban' | null;
  pricing_model: 'fixed_price' | 'time_materials' | null;
  date_from: string | null;
  date_to: string | null;
  objective: string | null;
  scope: { in: string; out: string } | null;
  status: CharterStatus;
  rejection_reason: string | null;
  rejected_stage: 'pmo' | 'bod' | null;
  pmo_signed_off_at: string | null;
  project_id: string | null;
  submitted_by_user_id: string | null;
  version: number;
}

export interface SubmitCharterBody {
  account_id: string;
  name: string;
  pm_worker_id: string;
  budget_bmm?: number;
  team_size?: number;
  methodology?: 'scrum' | 'kanban';
  pricing_model?: 'fixed_price' | 'time_materials';
  date_from?: string;
  date_to?: string;
  objective?: string;
  scope?: { in: string; out: string };
}

export async function fetchCharters(): Promise<CharterListRow[]> {
  const res = await fetch('/api/pm/v1/charters', { credentials: 'include' });
  const body = await handleResponse<{ charters: CharterListRow[] }>(res);
  return body.charters;
}

export async function fetchCharter(id: string): Promise<CharterDetail> {
  const res = await fetch(`/api/pm/v1/charters/${id}`, { credentials: 'include' });
  return handleResponse<CharterDetail>(res);
}

export async function submitCharter(input: SubmitCharterBody): Promise<{ charter_id: string }> {
  const res = await fetch('/api/pm/v1/charters', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ charter_id: string }>(res);
}

export async function pmoSignOffCharter(
  id: string,
  expected_version?: number,
): Promise<{ version: number }> {
  const res = await fetch(`/api/pm/v1/charters/${id}/pmo-signoff`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_version }),
  });
  return handleResponse<{ version: number }>(res);
}

export async function bodApproveCharter(
  id: string,
  expected_version?: number,
): Promise<{ project_id: string }> {
  const res = await fetch(`/api/pm/v1/charters/${id}/bod-approve`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_version }),
  });
  return handleResponse<{ project_id: string }>(res);
}

export async function rejectCharter(
  id: string,
  reason: string,
  expected_version?: number,
): Promise<{ version: number }> {
  const res = await fetch(`/api/pm/v1/charters/${id}/reject`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, expected_version }),
  });
  return handleResponse<{ version: number }>(res);
}

export async function withdrawCharter(
  id: string,
  expected_version?: number,
): Promise<{ version: number }> {
  const res = await fetch(`/api/pm/v1/charters/${id}/withdraw`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_version }),
  });
  return handleResponse<{ version: number }>(res);
}

export interface ProjectListRow {
  project_id: string;
  account_id: string;
  name: string;
  phase: string;
  status: 'active' | 'on_hold' | 'closed';
  pm_worker_id: string | null;
}

export interface ProjectDetail extends ProjectListRow {
  charter_id: string | null;
  objective: string | null;
  scope: { in: string; out: string } | null;
  budget_bmm: string | null;
  pmo_worker_id: string | null;
  team_size: number | null;
  methodology: string | null;
  pricing_model: string | null;
  date_from: string | null;
  date_to: string | null;
  planner_group_id: string | null;
  version: number;
}

export interface ProjectPatch {
  objective?: string | null;
  scope?: { in: string; out: string } | null;
  phase?: string;
  status?: 'active' | 'on_hold' | 'closed';
}

export interface ProjectAccessRow {
  worker_id: string;
  level: 'owner' | 'edit' | 'view';
}

export interface StaffingPlanLine {
  line_id: string;
  role: string;
  effort_mm: string | null;
  skills: string[] | null;
  version: number;
}

export async function fetchProjects(): Promise<ProjectListRow[]> {
  const res = await fetch('/api/pm/v1/projects', { credentials: 'include' });
  return (await handleResponse<{ projects: ProjectListRow[] }>(res)).projects;
}

export async function fetchProject(id: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/pm/v1/projects/${id}`, { credentials: 'include' });
  return handleResponse<ProjectDetail>(res);
}

export async function editProject(
  id: string,
  input: { expected_version?: number; patch: ProjectPatch },
): Promise<{ version: number }> {
  const res = await fetch(`/api/pm/v1/projects/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ version: number }>(res);
}

export async function closeProject(
  id: string,
  expected_version?: number,
): Promise<{ version: number }> {
  const res = await fetch(`/api/pm/v1/projects/${id}/close`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_version }),
  });
  return handleResponse<{ version: number }>(res);
}

export async function reopenProject(
  id: string,
  expected_version?: number,
): Promise<{ version: number }> {
  const res = await fetch(`/api/pm/v1/projects/${id}/reopen`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_version }),
  });
  return handleResponse<{ version: number }>(res);
}

export async function linkPlannerGroup(
  id: string,
  planner_group_id: string | null,
  expected_version?: number,
): Promise<{ version: number }> {
  const res = await fetch(`/api/pm/v1/projects/${id}/planner-link`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planner_group_id, expected_version }),
  });
  return handleResponse<{ version: number }>(res);
}

export async function fetchProjectAccess(id: string): Promise<ProjectAccessRow[]> {
  const res = await fetch(`/api/pm/v1/projects/${id}/access`, { credentials: 'include' });
  return (await handleResponse<{ access: ProjectAccessRow[] }>(res)).access;
}

export async function setProjectAccess(
  id: string,
  grants: ProjectAccessRow[],
): Promise<{ added: number; removed: number; changed: number }> {
  const res = await fetch(`/api/pm/v1/projects/${id}/access`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grants }),
  });
  return handleResponse(res);
}

export async function fetchStaffingPlan(id: string): Promise<StaffingPlanLine[]> {
  const res = await fetch(`/api/pm/v1/projects/${id}/staffing-plan`, { credentials: 'include' });
  return (await handleResponse<{ lines: StaffingPlanLine[] }>(res)).lines;
}

export async function upsertStaffingPlanLine(
  id: string,
  input: {
    line_id?: string;
    expected_version?: number;
    role: string;
    effort_mm?: number;
    skills?: string[];
  },
): Promise<{ line_id: string; version: number }> {
  const res = await fetch(`/api/pm/v1/projects/${id}/staffing-plan`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse(res);
}

export async function deleteStaffingPlanLine(
  id: string,
  lineId: string,
  expectedVersion?: number,
): Promise<{ deleted: boolean }> {
  const url =
    expectedVersion !== undefined
      ? `/api/pm/v1/projects/${id}/staffing-plan/${lineId}?expected_version=${expectedVersion}`
      : `/api/pm/v1/projects/${id}/staffing-plan/${lineId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

export interface AllocationRow {
  allocation_id: string;
  worker_id: string | null;
  role: string | null;
  planned_pct: number | null;
  bucket: 'billable' | 'internal' | 'bench';
  status: 'placeholder' | 'tentative' | 'committed';
}

export async function fetchProjectAllocations(projectId: string): Promise<AllocationRow[]> {
  const res = await fetch(`/api/pm/v1/projects/${projectId}/allocations`, {
    credentials: 'include',
  });
  return (await handleResponse<{ allocations: AllocationRow[] }>(res)).allocations;
}

export async function createAllocation(body: {
  project_id: string;
  worker_id: string;
  role: string;
  planned_pct: number;
  date_from?: string | null;
  date_to?: string | null;
  status?: 'placeholder' | 'tentative' | 'committed';
}): Promise<{ allocation_id: string }> {
  const res = await fetch('/api/pm/v1/allocations', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket: 'billable', status: 'committed', ...body }),
  });
  return handleResponse<{ allocation_id: string }>(res);
}

export async function removeAllocation(allocationId: string): Promise<void> {
  const res = await fetch(`/api/pm/v1/allocations/${allocationId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) await handleResponse(res);
}
