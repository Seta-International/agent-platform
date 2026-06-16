export interface PlannerGroupOption {
  id: string;
  name: string;
}

export async function listPlannerGroups(): Promise<PlannerGroupOption[]> {
  const res = await fetch('/api/planner/v1/groups', { credentials: 'include' });
  if (!res.ok) throw new Error(`/planner/v1/groups failed: ${res.status}`);
  const body = (await res.json()) as { groups?: PlannerGroupOption[] };
  return body.groups ?? [];
}
