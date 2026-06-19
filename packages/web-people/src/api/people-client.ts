export interface WorkerListRow {
  worker_id: string;
  full_name: string;
  work_email: string;
  lifecycle_stage: string;
}

export interface WorkerDetail extends WorkerListRow {
  job_title: string | null;
  department: string | null;
  hire_date: string | null;
  employment_type: string | null;
}

export interface WorkerHistoryEntry {
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}

export interface CreateWorkerInput {
  full_name: string;
  work_email?: string;
  job_title?: string;
  department?: string;
  employment_type?: string;
  hire_date?: string;
}

export interface EditWorkerInput {
  full_name?: string;
  work_email?: string;
  job_title?: string;
  department?: string;
  employment_type?: string;
  hire_date?: string;
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

export async function editWorker(id: string, body: EditWorkerInput): Promise<WorkerDetail> {
  const res = await fetch(`/api/people/v1/workers/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<WorkerDetail>(res);
}
