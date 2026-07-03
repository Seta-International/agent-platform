import { check, sleep } from 'k6';
import { get } from '../lib/api.ts';
import { loginAsMember } from '../lib/session.ts';

const T = { journey: 'pm' };

export function pmJourney(): void {
  loginAsMember();

  const accountsRes = get('/api/pm/v1/accounts', T);
  check(accountsRes, { 'accounts listed': (r) => r.status === 200 });

  const projectsRes = get('/api/pm/v1/projects', T);
  check(projectsRes, { 'projects listed': (r) => r.status === 200 });

  const body = projectsRes.json() as { projects?: { id: string }[] };
  if (body.projects?.length) {
    const p = body.projects[Math.floor(Math.random() * body.projects.length)];
    const detailRes = get(`/api/pm/v1/projects/${p.id}`, T);
    check(detailRes, { 'project detail': (r) => r.status === 200 });
  }

  sleep(1);
}
