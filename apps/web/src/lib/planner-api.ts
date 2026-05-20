export interface PlannerGroupListItem {
  id: string;
  tenant_id: string;
  name: string;
  account_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export async function listPlannerGroups(signal?: AbortSignal): Promise<PlannerGroupListItem[]> {
  const res = await fetch('/api/planner/v1/groups', {
    credentials: 'include',
    signal,
  });
  if (!res.ok) throw new Error(`planner groups fetch failed: ${res.status}`);
  const data = (await res.json()) as { groups: PlannerGroupListItem[] };
  return data.groups;
}
