import { check, sleep } from 'k6';
import { get, patch, post } from '../lib/api.ts';
import { loginAsMember } from '../lib/session.ts';

export interface RunData {
  planId: string;
  bucketIds: string[];
}

const T = { journey: 'planner' };

// Read-heavy member journey (~80/20 read/write per spec §4): browse the run
// plan, list tasks, then one create -> progress-update cycle.
export function plannerJourney(data: RunData): void {
  loginAsMember();

  const planRes = get(`/api/planner/v1/plans/${data.planId}`, T);
  check(planRes, { 'plan read': (r) => r.status === 200 });

  const bucketsRes = get(`/api/planner/v1/plans/${data.planId}/buckets`, T);
  check(bucketsRes, { 'buckets read': (r) => r.status === 200 });

  const listRes = get(`/api/planner/v1/tasks?plan_id=${data.planId}`, T);
  check(listRes, { 'tasks read': (r) => r.status === 200 });

  const mineRes = get('/api/planner/v1/tasks/mine', T);
  check(mineRes, { 'my tasks read': (r) => r.status === 200 });

  sleep(1);

  const bucket = data.bucketIds[Math.floor(Math.random() * data.bucketIds.length)];
  const createRes = post(
    '/api/planner/v1/tasks',
    {
      plan_id: data.planId,
      bucket_id: bucket,
      title: `k6 task vu${__VU} i${__ITER}`,
      priority_number: 5,
    },
    T,
  );
  const created = check(createRes, { 'task created': (r) => r.status === 201 });

  if (created) {
    const task = createRes.json() as {
      id?: string;
      version?: number;
      task?: { id: string; version: number };
    };
    const id = task.task?.id ?? task.id;
    const version = task.task?.version ?? task.version ?? 1;
    const updRes = patch(
      `/api/planner/v1/tasks/${id}`,
      { expected_version: version, patch: { percent_complete: 50 } },
      T,
    );
    check(updRes, { 'task updated': (r) => r.status === 200 });
  }

  sleep(1);
}
