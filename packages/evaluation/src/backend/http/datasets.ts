import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { addCases } from '../domain/add-cases.ts';
import { createDataset } from '../domain/create-dataset.ts';
import { listDatasets } from '../domain/list-datasets.ts';

const createSchema = z.object({ name: z.string().min(1), description: z.string().optional() });
const caseSchema = z.object({
  input: z.unknown(),
  groundTruth: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const addCasesSchema = z.object({ cases: z.array(caseSchema).min(1) });

export function registerEvaluationDatasetRoutes(app: Hono<SessionEnv>): void {
  app.post('/api/evaluation/v1/datasets', async (c) => {
    const session = c.get('user');
    const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid' }, 400);
    const result = await createDataset({ ...parsed.data, session });
    return c.json(result, 201);
  });

  app.post('/api/evaluation/v1/datasets/:id/cases', async (c) => {
    const session = c.get('user');
    const datasetId = c.req.param('id');
    const parsed = addCasesSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid' }, 400);
    const result = await addCases({ datasetId, cases: parsed.data.cases, session });
    return c.json(result, 201);
  });

  app.get('/api/evaluation/v1/datasets', async (c) => {
    const session = c.get('user');
    return c.json(await listDatasets({ session }));
  });
}
