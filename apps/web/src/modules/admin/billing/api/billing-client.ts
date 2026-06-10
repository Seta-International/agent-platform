export interface PeriodUsage {
  spend: number;
  limit: number | null;
}
export interface UsageBreakdownRow {
  feature: string;
  modelKey: string;
  cost: number;
}
export interface TenantUsage {
  currency: string;
  day: PeriodUsage;
  month: PeriodUsage;
  breakdown: UsageBreakdownRow[];
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

export async function getTenantUsage(): Promise<TenantUsage> {
  const res = await fetch('/api/billing/v1/usage', { credentials: 'include' });
  return (await jsonOrThrow(res)) as TenantUsage;
}
