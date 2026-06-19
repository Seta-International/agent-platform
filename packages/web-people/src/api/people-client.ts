export interface WorkerListRow {
  worker_id: string;
  full_name: string;
  work_email: string;
  lifecycle_stage: string;
}

export interface WorkerDetail extends WorkerListRow {
  dob: string | null;
  gender: string | null;
  phone: string | null;
  emergency_contact: string | null;
  version: number;
}

export interface WorkerHistoryEntry {
  at: string;
  action: string;
  field: string;
  from_val: string | null;
  to_val: string | null;
  by_user_id: string;
}

export interface CreateWorkerInput {
  full_name: string;
  work_email?: string;
  job_title?: string;
  department?: string;
  employment_type?: string;
  hire_date?: string;
}

export interface WorkerPatch {
  full_name?: string;
  work_email?: string;
  phone?: string;
  dob?: string;
  gender?: string;
  emergency_contact?: string;
}

export interface EditWorkerInput {
  expected_version: number;
  patch: WorkerPatch;
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
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function fetchWorkers(): Promise<WorkerListRow[]> {
  const res = await fetch('/api/people/v1/workers', { credentials: 'include' });
  const body = await handleResponse<{ workers: WorkerListRow[] }>(res);
  return body.workers;
}

export async function createWorker(input: CreateWorkerInput): Promise<{ worker_id: string }> {
  const res = await fetch('/api/people/v1/workers', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ worker_id: string }>(res);
}

export async function fetchWorker(id: string): Promise<WorkerDetail> {
  const res = await fetch(`/api/people/v1/workers/${id}`, { credentials: 'include' });
  return handleResponse<WorkerDetail>(res);
}

export async function fetchWorkerHistory(id: string): Promise<WorkerHistoryEntry[]> {
  const res = await fetch(`/api/people/v1/workers/${id}/history`, { credentials: 'include' });
  const body = await handleResponse<{ history: WorkerHistoryEntry[] }>(res);
  return body.history;
}

export async function editWorker(id: string, input: EditWorkerInput): Promise<{ version: number }> {
  const res = await fetch(`/api/people/v1/workers/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ version: number }>(res);
}
