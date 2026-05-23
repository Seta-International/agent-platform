export interface EnabledModulesResponse {
  enabled: string[];
}

export async function fetchEnabledModules(signal?: AbortSignal): Promise<EnabledModulesResponse> {
  const res = await fetch('/api/me/enabled-modules', { credentials: 'include', signal });
  if (!res.ok) throw new Error(`/me/enabled-modules failed: ${res.status}`);
  return res.json() as Promise<EnabledModulesResponse>;
}
