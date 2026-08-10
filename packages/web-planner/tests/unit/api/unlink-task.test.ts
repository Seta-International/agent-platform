import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { plannerClient } from '../../../src/api/planner-client';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('plannerClient.unlinkTask', () => {
  // A link is a row of task_references (design §3.1), and an INCOMING link's row
  // belongs to the OTHER task — so the row id is the only thing that can address
  // it, and there is no task id in the path.
  it('DELETEs the reference by its OWN id — no task id in the path', async () => {
    const seen = vi.fn<(path: string) => void>();
    server.use(
      http.delete('/api/planner/v1/task-references/:referenceId', ({ request }) => {
        seen(new URL(request.url).pathname);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await plannerClient.unlinkTask({ reference_id: 'ref-1' });
    expect(seen).toHaveBeenCalledWith('/api/planner/v1/task-references/ref-1');
  });
});
