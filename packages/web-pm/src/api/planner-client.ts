export interface PlannerGroupRow {
  id: string;
  name: string;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchPlannerGroups(): Promise<PlannerGroupRow[]> {
  const res = await fetch('/api/planner/v1/groups', { credentials: 'include' });
  const body = await handle<{ groups: Array<{ id: string; name: string }> }>(res);
  return body.groups.map((g) => ({ id: g.id, name: g.name }));
}

export async function createPlannerGroup(name: string): Promise<{ id: string }> {
  const res = await fetch('/api/planner/v1/groups', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return handle<{ id: string }>(res);
}
