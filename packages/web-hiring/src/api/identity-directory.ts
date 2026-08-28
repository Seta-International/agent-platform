// Batch id→name resolution against the identity directory (readable by any
// authenticated tenant member). Used for "by <actor>" attribution on the
// candidate activity timeline — hiring stores only actor_user_id, and the
// module boundary forbids resolving names in hiring's own backend.
export interface DirectoryUser {
  user_id: string;
  email: string;
  name: string;
}

export async function fetchDirectoryUsersByIds(ids: string[]): Promise<DirectoryUser[]> {
  if (ids.length === 0) return [];
  const res = await fetch(`/api/identity/v1/directory?ids=${ids.join(',')}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`directory lookup failed: ${res.status}`);
  const body = (await res.json()) as { rows: DirectoryUser[] };
  return body.rows;
}

// Name-search page of the directory — backs the interview panel picker (FUT-487). Capped at 50
// by the endpoint itself; MultiSelector filters client-side over whatever page is loaded.
export async function fetchDirectoryUsers(search?: string): Promise<DirectoryUser[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}&limit=50` : '?limit=50';
  const res = await fetch(`/api/identity/v1/directory${qs}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`directory lookup failed: ${res.status}`);
  const body = (await res.json()) as { rows: DirectoryUser[] };
  return body.rows;
}
