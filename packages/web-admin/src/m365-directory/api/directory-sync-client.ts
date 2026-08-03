/**
 * Wire types for the M365 directory-sync admin routes
 * (`packages/integrations/src/backend/http/directory-routes.ts`). Snake_case, because the server
 * serialises snake_case and translating it here would only add a second name for every field.
 */

const BASE = '/api/integrations/m365/directory';

export type DirectoryConflictKind =
  | 'manager_ambiguous'
  | 'email_collision'
  | 'unit_delete_blocked'
  | 'spine_collision'
  | 'user_removed';

export type DirectoryConflictStatus = 'open' | 'resolved' | 'ignored';

export type DirectoryResolutionAction =
  | 'choose_head'
  | 'reassign'
  | 'keep'
  | 'map_to_spine'
  | 'create_distinct'
  | 'offboard'
  | 'link'
  | 'ignore';

export interface DirectoryConflictRow {
  id: string;
  kind: DirectoryConflictKind;
  /**
   * The resolutions this row actually accepts, served by the API from `ACTIONS_BY_KIND` — the same
   * constant the resolver validates against. The screen renders buttons from THIS and never from a
   * local table: design §9.1's table has already drifted from the code once (it still lists
   * `create_new` for `email_collision`, which the resolver rejects), so a client-side copy would
   * render a button that 400s on click.
   */
  actions: DirectoryResolutionAction[];
  subject_type: 'person' | 'org_unit';
  subject_id: string | null;
  entra_oid: string | null;
  /** Kind-specific, passed through verbatim by the server. See §9.1. */
  detail: Record<string, unknown>;
  status: DirectoryConflictStatus;
  resolution: Record<string, unknown> | null;
  resolved_by: string | null;
  resolved_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

/** Design §11's counters, as the server keys them in `status.ts`. */
export interface DirectoryRunSummary {
  occurred_at: string;
  full: boolean;
  counters: Record<string, number>;
}

export interface DirectorySyncStatus {
  /** False when the tenant has no M365 config row — an unconfigured screen, not an error. */
  configured: boolean;
  last_synced_at: string | null;
  /** Only ever `ok`, `error` or null: the backend records no in-progress state. */
  last_status: string | null;
  last_error: string | null;
  cursor_present: boolean;
  last_run: DirectoryRunSummary | null;
  open_conflicts: number;
}

/** `resolved: false` is a refusal the admin can act on, not a transport failure. */
export interface ResolveConflictResult {
  resolved: boolean;
  reason?: string;
}

export interface ResolveConflictInput {
  conflictId: string;
  action: DirectoryResolutionAction;
  params?: Record<string, unknown>;
}

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ message: `HTTP ${res.status}` }))) as {
      message?: string;
    };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function listDirectoryConflicts(
  status: DirectoryConflictStatus = 'open',
): Promise<DirectoryConflictRow[]> {
  const res = await fetch(`${BASE}/conflicts?status=${status}`, { credentials: 'include' });
  const body = (await jsonOrThrow(res)) as { conflicts?: DirectoryConflictRow[] };
  return body.conflicts ?? [];
}

export async function resolveDirectoryConflict(
  input: ResolveConflictInput,
): Promise<ResolveConflictResult> {
  const res = await fetch(`${BASE}/conflicts/${input.conflictId}/resolve`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    // Omitted rather than sent as undefined: the route's zod schema treats an absent `params` as
    // "this action takes none", and an explicit null would fail it.
    body: JSON.stringify(
      input.params ? { action: input.action, params: input.params } : { action: input.action },
    ),
  });
  return (await jsonOrThrow(res)) as ResolveConflictResult;
}

/**
 * Always a full run. §10 makes the full census the only mode that reaps org units and re-checks
 * the whole tenant, which is what an admin pressing "Sync now" after fixing something in Entra is
 * asking for; the incremental delta is the cron's job.
 */
export async function startDirectorySync(): Promise<{ enqueued: boolean; full: boolean }> {
  const res = await fetch(`${BASE}/sync`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ full: true }),
  });
  return (await jsonOrThrow(res)) as { enqueued: boolean; full: boolean };
}

export async function getDirectorySyncStatus(): Promise<DirectorySyncStatus> {
  const res = await fetch(`${BASE}/status`, { credentials: 'include' });
  return (await jsonOrThrow(res)) as DirectorySyncStatus;
}
