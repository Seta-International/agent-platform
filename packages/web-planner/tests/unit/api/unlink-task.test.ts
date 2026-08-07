import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { plannerClient } from '../../../src/api/planner-client';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('plannerClient.unlinkTask', () => {
  it('DELETEs the link by its OWN id — no task id in the path', async () => {
    const seen = vi.fn<(path: string) => void>();
    server.use(
      http.delete('/api/planner/v1/task-links/:linkId', ({ request }) => {
        seen(new URL(request.url).pathname);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await plannerClient.unlinkTask({ link_id: 'l1' });
    expect(seen).toHaveBeenCalledWith('/api/planner/v1/task-links/l1');
  });
});
