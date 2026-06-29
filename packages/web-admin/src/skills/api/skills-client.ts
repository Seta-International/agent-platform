export interface SkillCategory {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  version: number;
}

export interface Skill {
  id: string;
  category_id: string;
  name: string;
  active: boolean;
  version: number;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function listCategories(activeOnly = true): Promise<SkillCategory[]> {
  const qs = activeOnly ? '?activeOnly=true' : '';
  const res = await fetch(`/api/identity/v1/skill-categories${qs}`, { credentials: 'include' });
  return (await json<{ categories: SkillCategory[] }>(res)).categories;
}

export async function createCategory(input: {
  name: string;
  sort_order?: number;
}): Promise<{ id: string }> {
  const res = await fetch('/api/identity/v1/skill-categories', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return json<{ id: string }>(res);
}

export async function updateCategory(
  id: string,
  input: { name?: string; sort_order?: number; expected_version?: number },
): Promise<{ version: number }> {
  const res = await fetch(`/api/identity/v1/skill-categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return json<{ version: number }>(res);
}

export async function archiveCategory(id: string, expected_version: number): Promise<void> {
  await json(
    await fetch(`/api/identity/v1/skill-categories/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expected_version }),
    }),
  );
}

export async function listSkills(opts?: {
  categoryId?: string;
  activeOnly?: boolean;
}): Promise<Skill[]> {
  const params = new URLSearchParams();
  if (opts?.categoryId) params.set('categoryId', opts.categoryId);
  if (opts?.activeOnly) params.set('activeOnly', 'true');
  const qs = params.toString();
  const res = await fetch(`/api/identity/v1/skills${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
  });
  return (await json<{ skills: Skill[] }>(res)).skills;
}

export async function createSkill(input: {
  category_id: string;
  name: string;
}): Promise<{ id: string }> {
  const res = await fetch('/api/identity/v1/skills', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return json<{ id: string }>(res);
}

export async function updateSkill(
  id: string,
  input: { category_id?: string; name?: string; expected_version?: number },
): Promise<{ version: number }> {
  const res = await fetch(`/api/identity/v1/skills/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return json<{ version: number }>(res);
}

export async function archiveSkill(id: string, expected_version: number): Promise<void> {
  await json(
    await fetch(`/api/identity/v1/skills/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expected_version }),
    }),
  );
}
