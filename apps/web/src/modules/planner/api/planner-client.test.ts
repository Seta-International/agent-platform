import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PlannerClientError, plannerClient } from './planner-client';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('plannerClient', () => {
  it('listGroups parses { groups: [...] }', async () => {
    server.use(
      http.get('*/api/planner/v1/groups', () =>
        HttpResponse.json({
          groups: [
            {
              id: 'g1',
              tenant_id: 't1',
              name: 'Eng',
              account_id: null,
              created_by: 'u1',
              created_at: '2026-05-20T00:00:00Z',
              updated_at: '2026-05-20T00:00:00Z',
              deleted_at: null,
              version: 1,
            },
          ],
        }),
      ),
    );
    const groups = await plannerClient.listGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe('Eng');
  });

  it('throws PlannerClientError(409) with current_version on CONFLICT', async () => {
    server.use(
      http.patch('*/api/planner/v1/tasks/t1', () =>
        HttpResponse.json({ error: 'CONFLICT', current_version: 7 }, { status: 409 }),
      ),
    );
    await expect(
      plannerClient.updateTask({
        task_id: 't1',
        expected_version: 6,
        patch: { title: 'X' },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      body: { current_version: 7 },
    });
  });

  it('moveTask sends to_bucket_id (nullable) + after_task_id', async () => {
    let captured: unknown;
    server.use(
      http.post('*/api/planner/v1/tasks/t1/move', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          id: 't1',
          tenant_id: 't',
          plan_id: 'p1',
          bucket_id: 'b2',
          title: 'x',
          description: null,
          priority: 'medium',
          progress: 'not_started',
          review_state: null,
          skill_tags: [],
          due_at: null,
          sort_order: 1,
          created_by: 'u',
          created_at: '',
          updated_at: '',
          deleted_at: null,
          version: 2,
        });
      }),
    );
    await plannerClient.moveTask({
      task_id: 't1',
      expected_version: 1,
      to_bucket_id: 'b2',
      after_task_id: 't0',
    });
    expect(captured).toEqual({
      expected_version: 1,
      to_bucket_id: 'b2',
      after_task_id: 't0',
    });
  });

  it('listTaskEvents returns { events, next_cursor? }', async () => {
    server.use(
      http.get('*/api/planner/v1/tasks/t1/events', () =>
        HttpResponse.json({
          events: [
            {
              id: '42',
              event_type: 'planner.task.created',
              event_version: 1,
              aggregate_type: 'planner.task',
              aggregate_id: 't1',
              tenant_id: 't',
              trace_id: null,
              caused_by_event_id: null,
              occurred_at: '2026-05-20T00:00:00Z',
              payload: { actor: { type: 'user', user_id: 'u' }, group_id: 'g' },
            },
          ],
          next_cursor: 'abc',
        }),
      ),
    );
    const r = await plannerClient.listTaskEvents({ task_id: 't1', limit: 10 });
    expect(r.events).toHaveLength(1);
    expect(r.next_cursor).toBe('abc');
  });

  it('PlannerClientError surfaces non-2xx with body parsed', async () => {
    server.use(
      http.get('*/api/planner/v1/groups/g1', () =>
        HttpResponse.json({ error: 'FORBIDDEN', message: 'no' }, { status: 403 }),
      ),
    );
    await expect(plannerClient.getGroup('g1')).rejects.toBeInstanceOf(PlannerClientError);
  });
});
