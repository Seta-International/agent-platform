export interface SsoProviderRowDto {
  tenant_id: string;
  provider_id: 'microsoft-entra-id';
  enabled: boolean;
  config: {
    entra_tenant_id: string;
    consent_granted_at: string | null;
    consent_granted_by_oid: string | null;
    consent_granted_by_email: string | null;
  };
  email_domains: string[];
  created_at: string;
  updated_at: string;
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

export async function listProviders(): Promise<SsoProviderRowDto[]> {
  const res = await fetch('/api/identity/v1/sso/providers', { credentials: 'include' });
  return ((await jsonOrThrow(res)) as { rows: SsoProviderRowDto[] }).rows;
}

export async function registerProvider(body: {
  entra_tenant_id: string;
  email_domains: string[];
}): Promise<SsoProviderRowDto> {
  const res = await fetch('/api/identity/v1/sso/providers', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await jsonOrThrow(res)) as SsoProviderRowDto;
}

export async function startConsent(): Promise<{ admin_consent_url: string }> {
  const res = await fetch('/api/identity/v1/sso/consent/microsoft/start', {
    method: 'POST',
    credentials: 'include',
  });
  return (await jsonOrThrow(res)) as { admin_consent_url: string };
}

export async function setProviderEnabled(enabled: boolean): Promise<SsoProviderRowDto> {
  const action = enabled ? 'enable' : 'disable';
  const res = await fetch(`/api/identity/v1/sso/providers/microsoft-entra-id/${action}`, {
    method: 'POST',
    credentials: 'include',
  });
  return (await jsonOrThrow(res)) as SsoProviderRowDto;
}

export async function disconnectProvider(): Promise<void> {
  const res = await fetch('/api/identity/v1/sso/providers/microsoft-entra-id', {
    method: 'DELETE',
    credentials: 'include',
  });
  await jsonOrThrow(res);
}

export interface EntraImportableUserDto {
  entra_oid: string;
  email: string;
  display_name: string;
  account_enabled: boolean;
  already_in_seta: boolean;
}

export async function listEntraUsers(): Promise<EntraImportableUserDto[]> {
  const res = await fetch('/api/identity/v1/sso/entra/users', { credentials: 'include' });
  return ((await jsonOrThrow(res)) as { users: EntraImportableUserDto[] }).users;
}

export async function importEntraUsers(
  selected_oids: string[],
): Promise<{ imported: string[]; skipped: { entra_oid: string; reason: string }[] }> {
  const res = await fetch('/api/identity/v1/sso/entra/users/import', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ selected_oids }),
  });
  return (await jsonOrThrow(res)) as {
    imported: string[];
    skipped: { entra_oid: string; reason: string }[];
  };
}

export async function setLocalPasswordDisabled(disabled: boolean): Promise<void> {
  const res = await fetch('/api/identity/v1/tenants/me/local-password-disabled', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ disabled }),
  });
  await jsonOrThrow(res);
}
