export interface AuditActor {
  user_id?: string | null;
  kind?: string;
  [key: string]: unknown;
}

export interface AuditRowDto {
  event_id: string;
  occurred_at: string;
  event_type: string;
  aggregate_type?: string;
  aggregate_id?: string;
  actor: AuditActor | null;
  payload?: unknown;
  before: unknown;
  after: unknown;
  trace_id: string | null;
}

export interface AuditListResponse {
  rows: AuditRowDto[];
  total: number;
}

export type AuditSortBy = 'occurred_at' | 'event_type';
export type AuditSortDir = 'asc' | 'desc';

export interface AuditListParams {
  event_type?: string;
  aggregate_id?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
  sort_by?: AuditSortBy;
  sort_dir?: AuditSortDir;
}

export async function listAuditEvents(
  params: AuditListParams,
  signal?: AbortSignal,
): Promise<AuditListResponse> {
  const q = new URLSearchParams();
  if (params.event_type) q.set('event_type', params.event_type);
  if (params.aggregate_id) q.set('aggregate_id', params.aggregate_id);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  q.set('limit', String(params.limit));
  q.set('offset', String(params.offset));
  if (params.sort_by) q.set('sort_by', params.sort_by);
  if (params.sort_dir) q.set('sort_dir', params.sort_dir);

  const res = await fetch(`/api/identity/v1/audit?${q}`, { credentials: 'include', signal });
  if (!res.ok) throw new Error(`/audit failed: ${res.status}`);
  return res.json() as Promise<AuditListResponse>;
}
