import { check, sleep } from 'k6';
import { get } from '../lib/api.ts';
import { loginAsMember } from '../lib/session.ts';

const T = { journey: 'people' };
const SEARCHES = ['an', 'ng', 'tr', 'le', 'ph'];

export function peopleJourney(): void {
  loginAsMember();

  const listRes = get('/api/people/v1/workers?page=1&pageSize=25', T);
  check(listRes, { 'workers listed': (r) => r.status === 200 });

  const q = SEARCHES[Math.floor(Math.random() * SEARCHES.length)];
  const searchRes = get(`/api/people/v1/workers?search=${q}&page=1&pageSize=25`, T);
  check(searchRes, { 'workers searched': (r) => r.status === 200 });

  const body = listRes.json() as { rows?: { id: string }[] };
  if (body.rows?.length) {
    const w = body.rows[Math.floor(Math.random() * body.rows.length)];
    const detailRes = get(`/api/people/v1/workers/${w.id}`, T);
    check(detailRes, { 'worker detail': (r) => r.status === 200 });
  }

  sleep(1);
}
