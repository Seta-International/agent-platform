import type { APIRequestContext } from '@playwright/test';

interface GroupRow {
  id: string;
  name: string;
  external_source?: string | null;
}

interface PlanRow {
  id: string;
  name: string;
  group_id: string;
}

interface TaskRow {
  id: string;
  title: string;
  plan_id: string;
}

async function getJson<T>(request: APIRequestContext, url: string): Promise<T> {
  const res = await request.get(url);
  if (!res.ok()) throw new Error(`${url} → ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function resolveGroupId(request: APIRequestContext, name: string): Promise<string> {
  const { groups } = await getJson<{ groups: GroupRow[] }>(request, '/api/planner/v1/groups');
  const match = groups.find((g) => g.name === name);
  if (!match) {
    throw new Error(
      `group "${name}" not found; available: ${groups.map((g) => g.name).join(', ')}`,
    );
  }
  return match.id;
}

export async function resolveLinkedGroupId(request: APIRequestContext): Promise<string> {
  const { groups } = await getJson<{ groups: GroupRow[] }>(request, '/api/planner/v1/groups');
  const match = groups.find((g) => g.external_source === 'm365');
  if (!match) {
    throw new Error('no group with external_source=m365 found; extend seed');
  }
  return match.id;
}

export async function resolvePlanId(
  request: APIRequestContext,
  groupName: string,
  planName: string,
): Promise<string> {
  const groupId = await resolveGroupId(request, groupName);
  const { plans } = await getJson<{ plans: PlanRow[] }>(
    request,
    `/api/planner/v1/plans?group_id=${groupId}`,
  );
  const match = plans.find((p) => p.name === planName);
  if (!match) {
    throw new Error(
      `plan "${planName}" not found in group "${groupName}"; available: ${plans.map((p) => p.name).join(', ')}`,
    );
  }
  return match.id;
}

export async function resolveTaskId(
  request: APIRequestContext,
  planId: string,
  title: string,
): Promise<string> {
  // Paginate until found or exhausted; demo plans have ≤14 tasks so one page is enough.
  const { tasks } = await getJson<{ tasks: TaskRow[]; next_cursor?: string }>(
    request,
    `/api/planner/v1/tasks?plan_id=${planId}&limit=200`,
  );
  const match = tasks.find((t) => t.title === title);
  if (!match) {
    throw new Error(
      `task "${title}" not found in plan ${planId}; available titles: ${tasks
        .slice(0, 10)
        .map((t) => t.title)
        .join(', ')}…`,
    );
  }
  return match.id;
}

export async function resolveFirstTaskId(
  request: APIRequestContext,
  planId: string,
): Promise<string> {
  const { tasks } = await getJson<{ tasks: TaskRow[] }>(
    request,
    `/api/planner/v1/tasks?plan_id=${planId}&limit=1`,
  );
  const first = tasks[0];
  if (!first) throw new Error(`plan ${planId} has no tasks`);
  return first.id;
}
