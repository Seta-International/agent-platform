#!/usr/bin/env node
// Standing planner read-corpus for the k6 suite (PRG-1 spec §6): group
// "Load Corpus" with all members, 5 plans x 3 buckets x 40 tasks, created
// through the public API (seed-through-public-functions pattern).
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const ADMIN_EMAIL = process.env.LOADTEST_ADMIN_EMAIL ?? 'admin@loadtest.test';
const ADMIN_PASSWORD = process.env.LOADTEST_ADMIN_PASSWORD;
const MEMBER_COUNT = Number(process.env.MEMBER_COUNT ?? 100);
const MEMBER_DOMAIN = process.env.MEMBER_DOMAIN ?? 'loadtest.test';
if (!ADMIN_PASSWORD) throw new Error('LOADTEST_ADMIN_PASSWORD required');

let cookie = '';
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
const unwrap = (raw, key) => raw?.[key] ?? raw;

await api('POST', '/api/identity/v1/auth/sign-in/email', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

const groupsRaw = await api('GET', '/api/planner/v1/groups');
const groups = Array.isArray(groupsRaw) ? groupsRaw : (groupsRaw.groups ?? []);
let group = groups.find((g) => g.name === 'Load Corpus');
if (!group) {
  group = unwrap(await api('POST', '/api/planner/v1/groups', { name: 'Load Corpus', visibility: 'private' }), 'group');
  console.log(`created group ${group.id}`);
}

const memberIds = [];
for (let i = 1; i <= MEMBER_COUNT; i++) {
  const email = `member${i}@${MEMBER_DOMAIN}`;
  const cand = await api('GET', `/api/planner/v1/groups/${group.id}/members/candidates?search=${encodeURIComponent(email)}`);
  const rows = Array.isArray(cand) ? cand : (cand.candidates ?? cand.users ?? []);
  const hit = rows.find((u) => (u.email ?? '').toLowerCase() === email);
  if (hit) memberIds.push({ user_id: hit.user_id ?? hit.id });
}
if (memberIds.length) {
  await api('POST', `/api/planner/v1/groups/${group.id}/members/bulk`, { members: memberIds });
  console.log(`added ${memberIds.length} members to Load Corpus`);
}

const plansRaw = await api('GET', `/api/planner/v1/plans?group_id=${group.id}`);
const existing = (Array.isArray(plansRaw) ? plansRaw : (plansRaw.plans ?? [])).map((p) => p.name);
for (let p = 1; p <= 5; p++) {
  const name = `Corpus Plan ${p}`;
  if (existing.includes(name)) {
    console.log(`plan "${name}" exists, skipping`);
    continue;
  }
  const plan = unwrap(await api('POST', '/api/planner/v1/plans', { group_id: group.id, name }), 'plan');
  const bucketIds = [];
  for (const bname of ['Backlog', 'Doing', 'Done']) {
    const bucket = unwrap(await api('POST', '/api/planner/v1/buckets', { plan_id: plan.id, name: bname }), 'bucket');
    bucketIds.push(bucket.id);
  }
  for (let t = 1; t <= 40; t++) {
    await api('POST', '/api/planner/v1/tasks', {
      plan_id: plan.id,
      bucket_id: bucketIds[t % 3],
      title: `Corpus task ${p}-${t}`,
      priority_number: [1, 3, 5, 9][t % 4],
    });
  }
  console.log(`created ${name} (3 buckets, 40 tasks)`);
}
console.log('✅ corpus ready');
