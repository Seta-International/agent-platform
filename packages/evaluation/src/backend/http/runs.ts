import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { createRun } from '../domain/create-run.ts';
import { getRun } from '../domain/get-run.ts';
import { listRunResults } from '../domain/list-run-results.ts';
import { listScorers } from '../domain/list-scorers.ts';

export interface RunRouteDeps {
  workers: {
    addJob(taskName: string, payload: unknown, spec?: { jobKey?: string }): Promise<unknown>;
  };
}

const createRunSchema = z.object({
  datasetId: z.string().min(1),
  targetModel: z.string().min(1),
  scorerIds: z.array(z.string().min(1)).min(1),
  judgeModel: z.string().optional(),
});

export function registerEvaluationRunRoutes(app: Hono<SessionEnv>, deps: RunRouteDeps): void {
  app.get('/api/evaluation/v1/scorers', (c) => c.json(listScorers()));

  app.post('/api/evaluation/v1/runs', async (c) => {
    const session = c.get('user');
    const parsed = createRunSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid' }, 400);
    const { runId } = await createRun({ ...parsed.data, session });
    await deps.workers.addJob(
      'evaluation_run',
      { runId, tenantId: session.tenant_id },
      { jobKey: runId },
    );
    return c.json({ runId }, 201);
  });

  app.get('/api/evaluation/v1/runs/:id', async (c) => {
    const session = c.get('user');
    return c.json(await getRun({ runId: c.req.param('id'), session }));
  });

  app.get('/api/evaluation/v1/runs/:id/results', async (c) => {
    const session = c.get('user');
    const limit = Number(c.req.query('limit') ?? '100');
    const offset = Number(c.req.query('offset') ?? '0');
    return c.json(await listRunResults({ runId: c.req.param('id'), limit, offset, session }));
  });
}
