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

  it('moveTask sends bucket_id (nullable) + after_id', async () => {
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
          priority_number: 5,
          percent_complete: 0,
          is_deferred: false,
          preview_type: 'automatic',
          review_state: null,
          skill_tags: [],
          start_at: null,
          due_at: null,
          order_hint: 'a',
          assignee_priority: null,
          external_source: 'native',
          external_id: null,
          external_etag: null,
          external_synced_at: null,
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
      bucket_id: 'b2',
      after_id: 't0',
    });
    expect(captured).toEqual({
      expected_version: 1,
      bucket_id: 'b2',
      after_id: 't0',
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

  it('searchM365Groups GET with encoded query string', async () => {
    server.use(
      http.get('*/api/integrations/m365/groups/search', () =>
        HttpResponse.json({
          groups: [{ external_id: 'ext1', display_name: 'Eng Team', mail_nickname: 'eng' }],
        }),
      ),
    );
    const result = await plannerClient.searchM365Groups('eng');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.external_id).toBe('ext1');
    expect(result.groups[0]?.display_name).toBe('Eng Team');
  });

  it('linkGroupToM365 POST with external_id body, returns GroupRow', async () => {
    let captured: unknown;
    const group = {
      id: 'g1',
      tenant_id: 't1',
      name: 'Eng',
      account_id: null,
      created_by: 'u1',
      created_at: '2026-05-20T00:00:00Z',
      updated_at: '2026-05-20T00:00:00Z',
      deleted_at: null,
      version: 2,
    };
    server.use(
      http.post('*/api/integrations/m365/groups/g1/link', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json(group);
      }),
    );
    const result = await plannerClient.linkGroupToM365({ groupId: 'g1', externalId: 'ext1' });
    expect(captured).toEqual({ external_id: 'ext1' });
    expect(result.id).toBe('g1');
  });

  it('unlinkGroupFromM365 POST with no body, returns GroupRow', async () => {
    const group = {
      id: 'g1',
      tenant_id: 't1',
      name: 'Eng',
      account_id: null,
      created_by: 'u1',
      created_at: '2026-05-20T00:00:00Z',
      updated_at: '2026-05-20T00:00:00Z',
      deleted_at: null,
      version: 3,
    };
    server.use(
      http.post('*/api/integrations/m365/groups/g1/unlink', () => HttpResponse.json(group)),
    );
    const result = await plannerClient.unlinkGroupFromM365({ groupId: 'g1' });
    expect(result.id).toBe('g1');
    expect(result.version).toBe(3);
  });

  it('refreshGroupSync POST returns { ok: true }', async () => {
    server.use(
      http.post('*/api/integrations/m365/groups/g1/refresh', () => HttpResponse.json({ ok: true })),
    );
    const result = await plannerClient.refreshGroupSync({ groupId: 'g1' });
    expect(result).toEqual({ ok: true });
  });

  it('resolveGroupConflict POST sends decisions array', async () => {
    let captured: unknown;
    server.use(
      http.post('*/api/integrations/m365/groups/g1/resolve', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const decisions = [
      { field: 'name', choice: 'local' as const },
      { field: 'description', choice: 'remote' as const },
    ];
    const result = await plannerClient.resolveGroupConflict({ groupId: 'g1', decisions });
    expect(captured).toEqual({ decisions });
    expect(result).toEqual({ ok: true });
  });

  it('getGroupSyncStatus GET returns sync status fields when linked', async () => {
    server.use(
      http.get('*/api/integrations/m365/groups/g1/sync-status', () =>
        HttpResponse.json({
          sync_status: 'idle',
          synced_at: '2026-05-20T00:00:00Z',
          last_error: null,
        }),
      ),
    );
    const result = await plannerClient.getGroupSyncStatus({ groupId: 'g1' });
    expect(result.sync_status).toBe('idle');
    if (result.sync_status !== null) {
      expect(result.synced_at).toBe('2026-05-20T00:00:00Z');
      expect(result.last_error).toBeNull();
    }
  });

  it('getGroupSyncStatus GET returns { sync_status: null } when not linked', async () => {
    server.use(
      http.get('*/api/integrations/m365/groups/g2/sync-status', () =>
        HttpResponse.json({ sync_status: null }),
      ),
    );
    const result = await plannerClient.getGroupSyncStatus({ groupId: 'g2' });
    expect(result.sync_status).toBeNull();
  });

  it('addTaskReference POSTs /api/planner/v1/tasks/:id/references with url/alias/type', async () => {
    let captured: unknown;
    server.use(
      http.post('*/api/planner/v1/tasks/t1/references', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          id: 'r1',
          tenant_id: 't',
          task_id: 't1',
          url: 'https://x',
          alias: 'X',
          type: 'web',
          preview_priority: null,
          external_etag: null,
          created_at: '2026-05-20T00:00:00Z',
          updated_at: '2026-05-20T00:00:00Z',
        });
      }),
    );
    const result = await plannerClient.addTaskReference({
      task_id: 't1',
      url: 'https://x',
      alias: 'X',
      type: 'web',
    });
    expect(captured).toEqual({ url: 'https://x', alias: 'X', type: 'web' });
    expect(result.id).toBe('r1');
  });

  it('removeTaskReference DELETEs /api/planner/v1/tasks/:id/references with body { url }', async () => {
    let captured: unknown;
    let method = '';
    server.use(
      http.delete('*/api/planner/v1/tasks/t1/references', async ({ request }) => {
        method = request.method;
        captured = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await plannerClient.removeTaskReference({ task_id: 't1', url: 'https://x' });
    expect(method).toBe('DELETE');
    expect(captured).toEqual({ url: 'https://x' });
  });

  it('setTaskAssignees PUTs /api/planner/v1/tasks/:id/assignees with assignees array', async () => {
    let captured: unknown;
    let method = '';
    server.use(
      http.put('*/api/planner/v1/tasks/t1/assignees', async ({ request }) => {
        method = request.method;
        captured = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await plannerClient.setTaskAssignees({
      task_id: 't1',
      assignees: [
        { user_id: 'u1', order_hint: 'a' },
        { user_id: 'u2', order_hint: 'b' },
      ],
    });
    expect(method).toBe('PUT');
    expect(captured).toEqual({
      assignees: [
        { user_id: 'u1', order_hint: 'a' },
        { user_id: 'u2', order_hint: 'b' },
      ],
    });
  });

  it('setAssigneePriority PUTs /api/planner/v1/tasks/:id/assignee-priority with { value }', async () => {
    let captured: unknown;
    let method = '';
    server.use(
      http.put('*/api/planner/v1/tasks/t1/assignee-priority', async ({ request }) => {
        method = request.method;
        captured = await request.json();
        return HttpResponse.json({
          id: 't1',
          tenant_id: 't',
          plan_id: 'p1',
          bucket_id: null,
          title: 'x',
          description: null,
          priority_number: 5,
          percent_complete: 0,
          is_deferred: false,
          preview_type: 'automatic',
          review_state: null,
          skill_tags: [],
          start_at: null,
          due_at: null,
          order_hint: null,
          assignee_priority: 'm',
          external_source: 'native',
          external_id: null,
          external_etag: null,
          external_synced_at: null,
          created_by: 'u',
          created_at: '',
          updated_at: '',
          deleted_at: null,
          version: 2,
        });
      }),
    );
    const r = await plannerClient.setAssigneePriority({ task_id: 't1', value: 'm' });
    expect(method).toBe('PUT');
    expect(captured).toEqual({ value: 'm' });
    expect(r.assignee_priority).toBe('m');
  });

  it('getPlanCategories GETs /api/planner/v1/plans/:id/categories', async () => {
    server.use(
      http.get('*/api/planner/v1/plans/p1/categories', () =>
        HttpResponse.json({
          descriptions: { '1': 'Backend' },
          labels: [],
          task_counts: {},
          counts: { categories: 1 },
        }),
      ),
    );
    const r = await plannerClient.getPlanCategories('p1');
    expect(r.descriptions).toEqual({ '1': 'Backend' });
    expect(r.counts.categories).toBe(1);
  });

  it('setCategoryDescriptions PUTs /api/planner/v1/plans/:id/categories with { slots }', async () => {
    let captured: unknown;
    let method = '';
    server.use(
      http.put('*/api/planner/v1/plans/p1/categories', async ({ request }) => {
        method = request.method;
        captured = await request.json();
        return HttpResponse.json({
          id: 'p1',
          tenant_id: 't',
          group_id: 'g1',
          name: 'P',
          category_descriptions: { '1': 'Backend' },
          external_source: 'native',
          external_id: null,
          external_etag: null,
          external_synced_at: null,
          created_by: 'u',
          created_at: '',
          updated_at: '',
          deleted_at: null,
          version: 2,
        });
      }),
    );
    await plannerClient.setCategoryDescriptions({
      plan_id: 'p1',
      slots: { 1: { name: 'Backend', label_id: 'l1' } },
    });
    expect(method).toBe('PUT');
    expect(captured).toEqual({ slots: { '1': { name: 'Backend', label_id: 'l1' } } });
  });

  it('updateTask accepts percent_complete in patch', async () => {
    let captured: unknown;
    server.use(
      http.patch('*/api/planner/v1/tasks/t1', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          id: 't1',
          tenant_id: 't',
          plan_id: 'p1',
          bucket_id: null,
          title: 'x',
          description: null,
          priority_number: 5,
          percent_complete: 50,
          is_deferred: false,
          preview_type: 'automatic',
          review_state: null,
          skill_tags: [],
          start_at: null,
          due_at: null,
          order_hint: null,
          assignee_priority: null,
          external_source: 'native',
          external_id: null,
          external_etag: null,
          external_synced_at: null,
          created_by: 'u',
          created_at: '',
          updated_at: '',
          deleted_at: null,
          version: 2,
        });
      }),
    );
    await plannerClient.updateTask({
      task_id: 't1',
      expected_version: 1,
      patch: {
        percent_complete: 50,
        start_at: '2026-05-01T00:00:00Z',
        preview_type: 'checklist',
      },
    });
    expect(captured).toEqual({
      expected_version: 1,
      patch: {
        percent_complete: 50,
        start_at: '2026-05-01T00:00:00Z',
        preview_type: 'checklist',
      },
    });
  });
});
