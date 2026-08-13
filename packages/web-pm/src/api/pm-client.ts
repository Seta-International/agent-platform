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
    let details: Record<string, unknown> | undefined;
    try {
      const body = (await res.json()) as { message?: string; details?: Record<string, unknown> };
      if (body.message) message = body.message;
      details = body.details;
    } catch {
      // ignore parse error
    }
    const err = new Error(message) as Error & {
      status?: number;
      details?: Record<string, unknown>;
    };
    err.status = res.status;
    err.details = details;
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

export interface CharterListQuery {
  status?: CharterStatus;
  account_id?: string;
  q?: string;
  sort?: 'submitted' | 'name' | 'budget' | 'team';
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface CharterListResult {
  charters: CharterListRow[];
  total: number;
}

export interface CharterSummary {
  total: number;
  submitted: number;
  pmo_approved: number;
  approved: number;
  rejected: number;
  withdrawn: number;
}

export async function fetchCharters(params: CharterListQuery = {}): Promise<CharterListResult> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const qs = sp.toString();
  const res = await fetch(`/api/pm/v1/charters${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  return handleResponse<CharterListResult>(res);
}

export async function fetchCharterSummary(): Promise<CharterSummary> {
  const res = await fetch('/api/pm/v1/charters/summary', { credentials: 'include' });
  return handleResponse<CharterSummary>(res);
}

export async function fetchCharter(id: string): Promise<CharterDetail> {
  const res = await fetch(`/api/pm/v1/charters/${id}`, { credentials: 'include' });
  return handleResponse<CharterDetail>(res);
}

export async function submitCharter(input: SubmitCharterBody): Promise<{ project_id: string }> {
  const res = await fetch('/api/pm/v1/charters', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ project_id: string }>(res);
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
  can_manage: boolean;
  can_report: boolean;
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
  org_unit_id: string | null;
  version: number;
}

export interface ProjectPatch {
  objective?: string | null;
  scope?: { in: string; out: string } | null;
  phase?: string;
  status?: 'active' | 'on_hold' | 'closed';
  org_unit_id?: string | null;
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
  role?: string | null;
  planned_pct: number;
  date_from?: string | null;
  date_to?: string | null;
  bucket?: 'billable' | 'internal' | 'bench';
  status?: 'placeholder' | 'tentative' | 'committed';
  note?: string | null;
}): Promise<{ allocation_id: string }> {
  const res = await fetch('/api/pm/v1/allocations', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket: 'billable', status: 'committed', ...body }),
  });
  return handleResponse<{ allocation_id: string }>(res);
}

export async function updateAllocation(
  allocationId: string,
  patch: {
    project_id?: string;
    role?: string | null;
    planned_pct?: number | null;
    status?: 'placeholder' | 'tentative' | 'committed';
    date_from?: string | null;
    date_to?: string | null;
    bucket?: 'billable' | 'internal' | 'bench';
    note?: string | null;
    expected_version?: number;
  },
): Promise<{ version: number }> {
  const res = await fetch(`/api/pm/v1/allocations/${allocationId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return handleResponse<{ version: number }>(res);
}

export async function removeAllocation(allocationId: string): Promise<void> {
  const res = await fetch(`/api/pm/v1/allocations/${allocationId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) await handleResponse(res);
}

export interface EffortConflict {
  project_name: string;
  date_from: string | null;
  date_to: string | null;
  planned_pct: number;
}

export interface CheckAllocationEffortResult {
  peak_pct: number;
  exceeds: boolean;
  conflicts: EffortConflict[];
}

export async function checkAllocationEffort(params: {
  worker_id: string;
  date_from: string;
  date_to: string;
  planned_pct: number;
  exclude_allocation_id?: string;
}): Promise<CheckAllocationEffortResult> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) sp.set(k, String(v));
  }
  const res = await fetch(`/api/pm/v1/allocations/effort-check?${sp}`, {
    credentials: 'include',
  });
  return handleResponse<CheckAllocationEffortResult>(res);
}

export interface SplitAllocationResult {
  updated_id: string;
  updated_version: number;
  continuation_id: string;
  warning: { peak_pct: number } | null;
}

export async function splitAllocation(
  allocationId: string,
  body: {
    new_end_date: string;
    continuation: {
      planned_pct?: number | null;
      bucket?: 'billable' | 'internal' | 'bench';
      date_to?: string | null;
      note?: string | null;
    };
    expected_version?: number;
  },
): Promise<SplitAllocationResult> {
  const res = await fetch(`/api/pm/v1/allocations/${allocationId}/split`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<SplitAllocationResult>(res);
}

export interface ReassignWarning {
  project_name: string;
  peak_pct: number;
}

export interface ReassignAllocationResult {
  source_updated_version: number;
  target_ids: string[];
  warnings: ReassignWarning[];
}

export interface ReassignPreviewSegment {
  project_name: string;
  account_name: string;
  bucket: 'billable' | 'internal' | 'bench';
  date_from: string;
  date_to: string | null;
  planned_pct: number;
}

export interface OverAllocationPeriod {
  date_from: string;
  date_to: string | null;
  peak_pct: number;
}

export interface ReassignPreviewResult {
  worker_name: string | null;
  source: ReassignPreviewSegment;
  targets: ReassignPreviewSegment[];
  peak_pct: number;
  exceeds: boolean;
  peak_from: string | null;
  peak_to: string | null;
  over_allocation_periods?: OverAllocationPeriod[];
}

export interface ReassignAllocationBody {
  source: {
    date_to: string;
  };
  targets: Array<{
    project_id: string;
    date_from: string;
    planned_pct: number;
    bucket?: 'billable' | 'internal' | 'bench';
    date_to?: string | null;
    note?: string | null;
  }>;
  expected_version?: number;
}

export async function reassignAllocation(
  allocationId: string,
  body: ReassignAllocationBody,
): Promise<ReassignAllocationResult> {
  const res = await fetch(`/api/pm/v1/allocations/${allocationId}/reassign`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<ReassignAllocationResult>(res);
}

export async function previewReassignAllocation(
  allocationId: string,
  body: ReassignAllocationBody,
): Promise<ReassignPreviewResult> {
  const res = await fetch(`/api/pm/v1/allocations/${allocationId}/reassign/preview`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<ReassignPreviewResult>(res);
}

export interface RaMonitoringAllocation {
  allocation_id: string;
  worker_id: string | null;
  worker_name: string | null;
  worker_title: string | null;
  role: string | null;
  planned_pct: number | null;
  bucket: 'billable' | 'internal' | 'bench';
  status: 'placeholder' | 'tentative' | 'committed';
  date_from: string | null;
  date_to: string | null;
  note: string | null;
  project_id: string;
  project_name: string;
  account_id: string;
  account_name: string;
  version: number;
  can_manage: boolean;
}

export async function fetchAllocations(params: {
  account_id?: string;
  project_id?: string;
  worker_id?: string;
  active_from?: string;
  active_to?: string;
  q?: string;
}): Promise<RaMonitoringAllocation[]> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  const res = await fetch(`/api/pm/v1/allocations${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
  });
  return (await handleResponse<{ allocations: RaMonitoringAllocation[] }>(res)).allocations;
}

export interface ReassignWorkerAllocationsResult {
  updated: Array<{ allocation_id: string; version: number }>;
  target_ids: string[];
  warnings: ReassignWarning[];
}

export interface RestrictedSegment {
  date_from: string;
  date_to: string | null;
  planned_pct: number;
}

export interface ReassignGroupPreviewResult {
  worker_name: string | null;
  sources: ReassignPreviewSegment[];
  targets: ReassignPreviewSegment[];
  peak_pct: number;
  exceeds: boolean;
  peak_from: string | null;
  peak_to: string | null;
  over_allocation_periods?: OverAllocationPeriod[];
  has_restricted_allocations?: boolean;
  restricted_segments?: RestrictedSegment[];
}

export interface ReassignWorkerAllocationsBody {
  worker_id: string;
  allocation_ids: string[];
  source: {
    date_to: string;
  };
  targets: Array<{
    project_id: string;
    date_from: string;
    planned_pct: number;
    bucket?: 'billable' | 'internal' | 'bench';
    date_to?: string | null;
    note?: string | null;
  }>;
}

export async function reassignWorkerAllocations(
  body: ReassignWorkerAllocationsBody,
): Promise<ReassignWorkerAllocationsResult> {
  const res = await fetch('/api/pm/v1/allocations/reassign-group', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<ReassignWorkerAllocationsResult>(res);
}

export async function previewReassignWorkerAllocations(
  body: ReassignWorkerAllocationsBody,
): Promise<ReassignGroupPreviewResult> {
  const res = await fetch('/api/pm/v1/allocations/reassign-group/preview', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<ReassignGroupPreviewResult>(res);
}

// ---- KPI Metrics (FUT-581) ----

export type KpiCategory = 'quality' | 'cost_capacity' | 'delivery' | 'process';
export type KpiTier = 'core' | 'extended';
export type RagStatus = 'green' | 'yellow' | 'red';

export type KpiRecordColour = RagStatus | 'gray';

export type BandCondition =
  | { op: 'lte' | 'lt' | 'gte' | 'gt' | 'eq'; value: number }
  | { op: 'between'; min: number; max: number }
  | { op: 'or' | 'and'; conditions: BandCondition[] };

export interface KpiNormMetricRow {
  metric_id: string;
  category: KpiCategory;
  tier: KpiTier;
  name: string;
  formula_label: string;
  component_count: 1 | 2;
  component_1_label: string;
  component_2_label: string | null;
  component_1_integer: boolean;
  component_2_integer: boolean;
  component_1_min: number | null;
  component_1_max: number | null;
  is_share: boolean;
  green_band: BandCondition;
  yellow_band: BandCondition;
  red_band: BandCondition;
  insight: string | null;
}

export interface KpiNormDoc {
  norm_id: string;
  code: string;
  revision: string;
  effective_date: string | null;
  metrics: KpiNormMetricRow[];
}

export async function fetchKpiNorm(): Promise<KpiNormDoc | null> {
  const res = await fetch('/api/pm/v1/kpi-norm', { credentials: 'include' });
  return handleResponse<KpiNormDoc | null>(res);
}

export interface AppliedMetricCoverage {
  metric_id: string;
  /** How many of the queried projects have this metric applied — compare against the queried
   * project count to tell "applied everywhere" from "applied to some". */
  applied_count: number;
  entered_count: number;
  would_empty_count: number;
}

export async function fetchAppliedMetrics(
  projectIds: string[],
  week?: { iso_year: number; iso_week: number },
): Promise<AppliedMetricCoverage[]> {
  if (projectIds.length === 0) return [];
  const sp = new URLSearchParams({ project_ids: projectIds.join(',') });
  if (week) {
    sp.set('iso_year', String(week.iso_year));
    sp.set('iso_week', String(week.iso_week));
  }
  const res = await fetch(`/api/pm/v1/kpi-applied-metrics?${sp.toString()}`, {
    credentials: 'include',
  });
  return (await handleResponse<{ coverage: AppliedMetricCoverage[] }>(res)).coverage;
}

export async function setAppliedMetric(
  metricId: string,
  applied: boolean,
  projectIds: string[],
): Promise<{ metric_id: string; applied: boolean; project_ids: string[] }> {
  const res = await fetch(`/api/pm/v1/kpi-applied-metrics/${metricId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applied, project_ids: projectIds }),
  });
  return handleResponse(res);
}

export interface KpiExplorerMetricCell {
  value: number | null;
  status: RagStatus | null;
  band: BandCondition | null;
}

export interface KpiExplorerMetricDef {
  metric_id: string;
  category: KpiCategory;
  name: string;
  component_count: 1 | 2;
  green_band: BandCondition;
}

export interface KpiExplorerRow {
  project_id: string;
  project_name: string;
  account_id: string;
  account_name: string;
  record_id: string | null;
  iso_year: number;
  iso_week: number;
  overall_health: RagStatus | null;
  category_health: Record<KpiCategory, RagStatus | null>;
  metrics: Record<string, KpiExplorerMetricCell>;
  can_manage: boolean;
  can_report: boolean;
}

export interface KpiExplorerResult {
  rows: KpiExplorerRow[];
  /** Union of every metric applied to any project in `rows` — Configure metrics is per-project,
   * so different projects can have different applied sets; build columns from this instead of
   * assuming one shared tenant-wide set. */
  applied_metric_ids: string[];
  metrics: KpiExplorerMetricDef[];
}

export async function fetchKpiExplorer(params: {
  iso_year: number;
  iso_week: number;
  account_id?: string;
  project_id?: string;
}): Promise<KpiExplorerResult> {
  const sp = new URLSearchParams();
  sp.set('iso_year', String(params.iso_year));
  sp.set('iso_week', String(params.iso_week));
  if (params.account_id) sp.set('account_id', params.account_id);
  if (params.project_id) sp.set('project_id', params.project_id);
  const res = await fetch(`/api/pm/v1/kpi-explorer?${sp.toString()}`, { credentials: 'include' });
  return handleResponse<KpiExplorerResult>(res);
}

export interface KpiRecordMetricRow extends KpiNormMetricRow {
  component_1_value: number | null;
  component_2_value: number | null;
  computed_value: number | null;
  status: RagStatus | null;
}

export interface KpiRecordDetail {
  record_id: string | null;
  project_id: string;
  iso_year: number;
  iso_week: number;
  version: number | null;
  metrics: KpiRecordMetricRow[];
  category_health: Record<KpiCategory, KpiRecordColour | null>;
  overall_health: KpiRecordColour | null;
}

export async function fetchKpiRecord(params: {
  project_id: string;
  iso_year: number;
  iso_week: number;
}): Promise<KpiRecordDetail> {
  const sp = new URLSearchParams({
    project_id: params.project_id,
    iso_year: String(params.iso_year),
    iso_week: String(params.iso_week),
  });
  const res = await fetch(`/api/pm/v1/kpi-records?${sp.toString()}`, { credentials: 'include' });
  return handleResponse<KpiRecordDetail>(res);
}

export interface UpsertKpiRecordBody {
  project_id: string;
  iso_year: number;
  iso_week: number;
  expected_version?: number | null;
  entries: Array<{
    metric_id: string;
    component_1_value: number | null;
    component_2_value: number | null;
  }>;
}

export async function upsertKpiRecord(
  body: UpsertKpiRecordBody,
): Promise<{ record_id: string; version: number; overall_health: RagStatus | null }> {
  const res = await fetch('/api/pm/v1/kpi-records', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

// ---- Weekly Reports (FUT-609) ----

export type ReportColour = 'green' | 'yellow' | 'red' | 'gray';

export interface WeekStats {
  applied_count: number;
  measured_count: number;
  yellow_count: number;
  red_count: number;
  worst: {
    metric_id: string;
    name: string;
    computed_value: number | null;
    component_count: 1 | 2;
    green_band: BandCondition;
    status: RagStatus;
  } | null;
}

export interface WeekMetric {
  metric_id: string;
  name: string;
  category: KpiCategory;
  computed_value: number | null;
  component_count: 1 | 2;
  green_band: BandCondition;
  status: RagStatus | null;
}

export interface WeeklyHeadlineMetric {
  label: string;
  name: string;
  computed_value: number;
  component_count: 1 | 2;
  status: RagStatus | null;
}

export interface WeeklyReportCard {
  project_id: string;
  project_name: string;
  account_id: string;
  account_name: string;
  pm_name: string | null;
  pmo_name: string | null;
  overall_colour: ReportColour | null;
  category_colours: Record<KpiCategory, ReportColour | null>;
  stats: WeekStats;
  /** People staffed this week vs the charter team size — the card's "Staffed X/Y". */
  staffed: number;
  team_size: number | null;
  /** Delivery pulse (util · predictability · CSS) for the week; unmeasured metrics omitted. */
  headline_metrics: WeeklyHeadlineMetric[];
  latest_summary: string | null;
  reporters: { reporter_id: string; name: string | null }[];
  report_count: number;
  can_manage: boolean;
  can_report: boolean;
  reported_by_me: boolean;
}

/** Server-authoritative current reporting week (Asia/Ho_Chi_Minh) — week pickers anchor on
 * this so the browser timezone can never shift the default context (FUT-589 AC2). */
export async function fetchCurrentWeek(): Promise<{ iso_year: number; iso_week: number }> {
  const res = await fetch('/api/pm/v1/current-week', { credentials: 'include' });
  return handleResponse(res);
}

export async function fetchWeeklyReports(params: {
  iso_year: number;
  iso_week: number;
  account_id?: string;
  project_id?: string;
}): Promise<WeeklyReportCard[]> {
  const sp = new URLSearchParams();
  sp.set('iso_year', String(params.iso_year));
  sp.set('iso_week', String(params.iso_week));
  if (params.account_id) sp.set('account_id', params.account_id);
  if (params.project_id) sp.set('project_id', params.project_id);
  const res = await fetch(`/api/pm/v1/weekly-reports?${sp.toString()}`, {
    credentials: 'include',
  });
  return (await handleResponse<{ rows: WeeklyReportCard[] }>(res)).rows;
}

export interface WeeklyReportComment {
  id: string;
  parent_comment_id: string | null;
  author_user_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface WeeklyReportEntry {
  report_id: string;
  reporter_id: string;
  reporter_name: string | null;
  status: 'draft' | 'submitted';
  /** A submitted revision exists — others see (and may comment on) that version. */
  published: boolean;
  executive_summary: string | null;
  risk_issue: string | null;
  road_to_green: string | null;
  road_to_green_owner_id: string | null;
  road_to_green_owner_name: string | null;
  road_to_green_due: string | null;
  overall_colour: ReportColour | null;
  version: number;
  updated_at: string;
  comments: WeeklyReportComment[];
}

export interface WeeklyReportDetail {
  project_id: string;
  project_name: string;
  account_name: string;
  phase: string;
  pricing_model: string | null;
  pm_person_id: string | null;
  pmo_person_id: string | null;
  staffed: number;
  team_size: number | null;
  headline_metrics: {
    label: string;
    name: string;
    computed_value: number;
    component_count: 1 | 2;
    status: RagStatus | null;
  }[];
  metrics: WeekMetric[];
  pm_name: string | null;
  pmo_name: string | null;
  week_editable: boolean;
  iso_year: number;
  iso_week: number;
  overall_colour: ReportColour | null;
  flags: {
    category: KpiCategory;
    computed_colour: ReportColour | null;
    final_colour: ReportColour | null;
    overridden: boolean;
  }[];
  stats: WeekStats;
  trend: { iso_year: number; iso_week: number; colour: ReportColour | null }[];
  reports: WeeklyReportEntry[];
  can_manage: boolean;
  can_report: boolean;
  my_reporter_id: string | null;
}

export async function fetchWeeklyReportDetail(params: {
  project_id: string;
  iso_year: number;
  iso_week: number;
}): Promise<WeeklyReportDetail> {
  const sp = new URLSearchParams({
    project_id: params.project_id,
    iso_year: String(params.iso_year),
    iso_week: String(params.iso_week),
  });
  const res = await fetch(`/api/pm/v1/weekly-reports/detail?${sp.toString()}`, {
    credentials: 'include',
  });
  return handleResponse<WeeklyReportDetail>(res);
}

export async function upsertWeeklyReport(body: {
  project_id: string;
  iso_year: number;
  iso_week: number;
  expected_version?: number;
  executive_summary: string;
  risk_issue?: string | null;
  road_to_green?: string | null;
  road_to_green_owner_id?: string | null;
  road_to_green_due?: string | null;
  category_colours?: Partial<Record<KpiCategory, ReportColour>>;
}): Promise<{ report_id: string; version: number; overall_colour: ReportColour | null }> {
  const res = await fetch('/api/pm/v1/weekly-reports', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function overrideWeeklyFlag(body: {
  project_id: string;
  iso_year: number;
  iso_week: number;
  category: KpiCategory;
  final_colour: ReportColour;
  reason: string;
}): Promise<{ flag_id: string; final_colour: ReportColour }> {
  const res = await fetch('/api/pm/v1/weekly-reports/flags/override', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function addWeeklyReportComment(body: {
  report_id: string;
  parent_comment_id?: string | null;
  body: string;
}): Promise<{ comment_id: string }> {
  const res = await fetch('/api/pm/v1/weekly-reports/comments', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}
