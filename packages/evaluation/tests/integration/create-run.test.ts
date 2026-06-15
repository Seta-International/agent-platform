import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createDataset } from '../../src/backend/domain/create-dataset.ts';
import { createRun } from '../../src/backend/domain/create-run.ts';
import { ALL_EVALUATION_PERMS, buildSession, readEvents } from '../helpers.ts';

const run = <T>(fn: (ctx: { pool: import('pg').Pool }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );

describe('createRun', () => {
  it('creates a pending run and emits evaluation.run.created', async () => {
    await run(async ({ pool }) => {
      const session = buildSession({ permissions: ALL_EVALUATION_PERMS });
      const { datasetId } = await createDataset({ name: 'DS', session });

      const { runId } = await createRun({
        datasetId,
        targetModel: 'mock/test',
        scorerIds: ['completeness'],
        session,
      });
      expect(runId).toBeTypeOf('string');

      const events = await readEvents(pool, session.tenant_id, 'evaluation.run.created');
      expect(events).toHaveLength(1);
      expect(events[0]?.payload.run_id).toBe(runId);
      expect(events[0]?.payload.dataset_id).toBe(datasetId);
    });
  });

  it('rejects an unknown scorer id', async () => {
    await run(async () => {
      const session = buildSession({ permissions: ALL_EVALUATION_PERMS });
      const { datasetId } = await createDataset({ name: 'DS', session });
      await expect(
        createRun({ datasetId, targetModel: 'mock/test', scorerIds: ['nope'], session }),
      ).rejects.toThrow(/unknown scorer/i);
    });
  });

  it('requires judgeModel when an llm-judge scorer is selected', async () => {
    await run(async () => {
      const session = buildSession({ permissions: ALL_EVALUATION_PERMS });
      const { datasetId } = await createDataset({ name: 'DS', session });
      await expect(
        createRun({ datasetId, targetModel: 'mock/test', scorerIds: ['toxicity'], session }),
      ).rejects.toThrow(/judgemodel/i);
    });
  });

  it('rejects an unresolvable target model (no credentials)', async () => {
    await run(async () => {
      delete process.env.OPENAI_API_KEY;
      const session = buildSession({ permissions: ALL_EVALUATION_PERMS });
      const { datasetId } = await createDataset({ name: 'DS', session });
      await expect(
        createRun({
          datasetId,
          targetModel: 'openai/gpt-4o',
          scorerIds: ['completeness'],
          session,
        }),
      ).rejects.toThrow(/credentials/i);
    });
  });
});
