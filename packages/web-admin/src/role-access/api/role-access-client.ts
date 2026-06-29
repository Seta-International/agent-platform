export interface MatrixCell {
  permission_key: string;
  description: string;
  seedDefault: boolean;
  effective: boolean;
  overridden: boolean;
}

export interface MatrixRole {
  slug: string;
  description: string;
  module: string;
  cells: MatrixCell[];
}

export async function getRoleAccessMatrix(module?: string): Promise<MatrixRole[]> {
  const qs = module ? `?module=${encodeURIComponent(module)}` : '';
  const res = await fetch(`/api/identity/v1/role-access${qs}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`role-access matrix failed: ${res.status}`);
  return ((await res.json()) as { roles: MatrixRole[] }).roles;
}

export async function setRolePermission(
  role: string,
  permission: string,
  enabled: boolean,
): Promise<void> {
  const res = await fetch(
    `/api/identity/v1/role-access/${encodeURIComponent(role)}/${encodeURIComponent(permission)}`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    },
  );
  if (!res.ok)
    throw new Error(
      ((await res.json().catch(() => ({}))) as { message?: string }).message ??
        `set permission failed: ${res.status}`,
    );
}

export async function resetRole(role: string): Promise<void> {
  const res = await fetch(`/api/identity/v1/role-access/${encodeURIComponent(role)}/reset`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`reset role failed: ${res.status}`);
}
