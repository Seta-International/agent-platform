export interface ImpersonateStatus {
  active: false;
}
export interface ImpersonateStatusActive {
  active: true;
  target: { user_id: string; email: string; display_name: string };
}

export async function getImpersonateStatus(): Promise<ImpersonateStatus | ImpersonateStatusActive> {
  const res = await fetch('/api/identity/v1/dev/impersonate', { credentials: 'include' });
  if (!res.ok) return { active: false };
  return res.json() as Promise<ImpersonateStatus | ImpersonateStatusActive>;
}

export async function startImpersonation(userId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/identity/v1/dev/impersonate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function exitImpersonation(): Promise<void> {
  await fetch('/api/identity/v1/dev/impersonate', {
    method: 'DELETE',
    credentials: 'include',
  });
}
