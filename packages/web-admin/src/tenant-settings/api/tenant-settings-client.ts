export interface TenantSettings {
  local_password_disabled: boolean;
  email_domains: string[];
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

export async function getTenantSettings(): Promise<TenantSettings> {
  const res = await fetch('/api/identity/v1/tenants/me/settings', { credentials: 'include' });
  return (await jsonOrThrow(res)) as TenantSettings;
}

export async function updateEmailDomains(email_domains: string[]): Promise<void> {
  const res = await fetch('/api/identity/v1/tenants/me/email-domains', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email_domains }),
  });
  await jsonOrThrow(res);
}
