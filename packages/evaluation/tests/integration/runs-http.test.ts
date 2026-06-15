import type { SessionEnv } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createDataset } from '../../src/backend/domain/create-dataset.ts';
import { buildEvaluationRoutes } from '../../src/backend/http/index.ts';
import { ALL_EVALUATION_PERMS, buildSession } from '../helpers.ts';

describe('POST /runs route', () => {
  it('creates a run and enqueues exactly one evaluation_run job keyed on runId', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const session = buildSession({ permissions: ALL_EVALUATION_PERMS });
          const { datasetId } = await createDataset({ name: 'DS', session });

          const enqueued: Array<{ task: string; payload: unknown; spec?: unknown }> = [];
          const deps = {
            pool: undefined,
            streams: undefined,
            workers: {
              addJob: async (task: string, payload: unknown, spec?: unknown) => {
                enqueued.push({ task, payload, spec });
                return undefined;
              },
            },
          } as never;

          const app = new Hono<SessionEnv>();
          app.use('*', async (c, next) => {
            c.set('user', session);
            await next();
          });
          app.route('/', buildEvaluationRoutes(deps));

          const res = await app.request('/api/evaluation/v1/runs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              datasetId,
              targetModel: 'mock/test',
              scorerIds: ['completeness'],
            }),
          });
          expect(res.status).toBe(201);
          const { runId } = (await res.json()) as { runId: string };

          expect(enqueued).toHaveLength(1);
          expect(enqueued[0]?.task).toBe('evaluation_run');
          expect(enqueued[0]?.payload).toMatchObject({ runId, tenantId: session.tenant_id });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
