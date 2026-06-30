export interface Group {
  group_id: string;
  slug: string;
  name: string;
  kind: 'default' | 'custom';
  is_base: boolean;
  member_count: number;
  role_slugs: string[];
}

async function post<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function send(method: string, url: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
}

export async function listGroups(): Promise<Group[]> {
  const res = await fetch('/api/identity/v1/groups', { credentials: 'include' });
  if (!res.ok) throw new Error(`/api/identity/v1/groups failed: ${res.status}`);
  return ((await res.json()) as { groups: Group[] }).groups;
}

export async function createGroup(body: {
  slug: string;
  name: string;
  description?: string;
  kind?: 'default' | 'custom';
  is_base?: boolean;
}): Promise<{ group_id: string }> {
  return post<{ group_id: string }>('/api/identity/v1/groups', body);
}

export async function setGroupRoles(id: string, role_slugs: string[]): Promise<void> {
  return send('PUT', `/api/identity/v1/groups/${id}/roles`, { role_slugs });
}

export async function addMembers(id: string, user_ids: string[]): Promise<void> {
  return send('POST', `/api/identity/v1/groups/${id}/members`, { user_ids });
}

export async function removeMember(id: string, userId: string): Promise<void> {
  return send('DELETE', `/api/identity/v1/groups/${id}/members/${userId}`);
}

export async function listUserGroups(
  userId: string,
): Promise<{ group_id: string; slug: string; name: string }[]> {
  const res = await fetch(`/api/identity/v1/groups/users/${userId}/groups`, {
    credentials: 'include',
  });
  if (!res.ok)
    throw new Error(`/api/identity/v1/groups/users/${userId}/groups failed: ${res.status}`);
  return ((await res.json()) as { groups: { group_id: string; slug: string; name: string }[] })
    .groups;
}
