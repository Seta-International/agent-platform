import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';
import { OPTIONS, RUN_ID } from './config.ts';
import { healthCanary } from './journeys/health.ts';
import { peopleJourney } from './journeys/people.ts';
import { plannerJourney, type RunData } from './journeys/planner.ts';
import { pmJourney } from './journeys/pm.ts';
import { del, get, post } from './lib/api.ts';
import { loginAsAdmin } from './lib/session.ts';

export const options = OPTIONS;

// Standing corpus group is created by scripts/loadtest-bootstrap.sh as
// "Load Corpus". Fallback: first group the admin can see (local smoke).
function resolveGroupId(): string {
  const res = get('/api/planner/v1/groups');
  if (res.status !== 200) throw new Error(`groups list failed: HTTP ${res.status}`);
  const body = res.json() as
    | { groups?: { id: string; name: string }[] }
    | { id: string; name: string }[];
  const groups = Array.isArray(body) ? body : (body.groups ?? []);
  if (!groups.length)
    throw new Error('no planner groups visible to admin — run scripts/loadtest-bootstrap.sh');
  return (groups.find((g) => g.name === 'Load Corpus') ?? groups[0]).id;
}

function idAndVersion(res: { json(): unknown }): { id: string; version: number } {
  const raw = res.json() as Record<string, unknown>;
  const entity = (raw.plan ?? raw.bucket ?? raw.task ?? raw) as { id: string; version?: number };
  return { id: entity.id, version: entity.version ?? 1 };
}

export function setup(): RunData {
  loginAsAdmin();
  const groupId = resolveGroupId();

  const planRes = post('/api/planner/v1/plans', { group_id: groupId, name: `k6 ${RUN_ID}` });
  if (planRes.status !== 201)
    throw new Error(`plan create failed: HTTP ${planRes.status} ${planRes.body}`);
  const plan = idAndVersion(planRes);

  const bucketIds: string[] = [];
  for (const name of ['Backlog', 'Doing', 'Done']) {
    const bRes = post('/api/planner/v1/buckets', { plan_id: plan.id, name });
    if (bRes.status !== 201) throw new Error(`bucket create failed: HTTP ${bRes.status}`);
    bucketIds.push(idAndVersion(bRes).id);
  }
  return { planId: plan.id, bucketIds };
}

// Deleting the run plan removes the run's task fan-out with it (spec §6: the
// loadtest tenant must stay bounded).
export function teardown(data: RunData): void {
  loginAsAdmin();
  const planRes = get(`/api/planner/v1/plans/${data.planId}`);
  if (planRes.status !== 200) {
    console.error(
      `teardown: plan fetch failed (HTTP ${planRes.status}); leftover plan ${data.planId} is RUN_ID-tagged`,
    );
    return;
  }
  const { version } = idAndVersion(planRes);
  const delRes = del(`/api/planner/v1/plans/${data.planId}`, { expected_version: version });
  if (delRes.status !== 204) {
    console.error(
      `teardown: plan delete failed (HTTP ${delRes.status}); delete plan "k6 ${RUN_ID}" manually`,
    );
  }
}

export { healthCanary, peopleJourney, plannerJourney, pmJourney };

export function handleSummary(data: unknown): Record<string, string> {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    '/out/summary.json': JSON.stringify(data, null, 2),
  };
}
