export interface FeatureFlagUsage {
  flag_key: string;
  adoption_count: number;
  total_evaluated: number;
  adoption_pct: number;
  last_evaluated_at: string | null;
  health: 'active' | 'inactive';
}

export interface FeatureFlagView {
  key: string;
  description: string;
  enabled_for_all: boolean;
  allowlist_user_ids: string[];
  strategies: { kind: string; config?: Record<string, unknown> }[];
  default_enabled: boolean;
  is_overridden: boolean;
  usage: FeatureFlagUsage;
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

export async function listFeatureFlags(): Promise<FeatureFlagView[]> {
  const res = await fetch('/api/identity/v1/feature-flags', { credentials: 'include' });
  return ((await jsonOrThrow(res)) as { flags: FeatureFlagView[] }).flags;
}

export async function setFeatureFlag(
  key: string,
  strategies: { kind: string; config?: Record<string, unknown> }[],
): Promise<void> {
  const res = await fetch(`/api/identity/v1/feature-flags/${encodeURIComponent(key)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ strategies }),
  });
  await jsonOrThrow(res);
}
