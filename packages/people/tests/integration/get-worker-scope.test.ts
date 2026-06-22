import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person, worker } from '../../src/backend/db/schema.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { getWorker, getWorkerHistory } from '../../src/index.ts';
import { buildSession, type SeededTenant, seedOrgUnit, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

/** Create a worker and bind its person.user_id to a known userId. */
async function makePersona(
  t: SeededTenant,
  name: string,
  userId: string,
  orgUnitId: string | null,
): Promise<string> {
  const { worker_id } = await createWorker({
    session: t.adminSession,
    full_name: name,
    org_unit_id: orgUnitId,
  } as never);
  await peopleDb().update(person).set({ user_id: userId }).where(eq(person.id, worker_id));
  return worker_id;
}

function withDb(
  fn: (a: { t: SeededTenant; M: string; R: string; U: string; userM: string }) => Promise<void>,
): Promise<void> {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    initPools({ databaseUrl });
    try {
      const t = await seedTenant(pool);
      const userM = crypto.randomUUID();

      // Manager M heads a unit; R is a member (reports to M); U is unrelated.
      const M = await makePersona(t, 'Manager M', userM, null);
      const unit = await seedOrgUnit({
        tenant_id: t.tenant_id,
        name: 'M Unit',
        kind: 'operation',
        head_worker_id: M,
      });
      await peopleDb().update(worker).set({ org_unit_id: unit }).where(eq(worker.person_id, M));
      const R = await makePersona(t, 'Report R', crypto.randomUUID(), unit);
      const U = await makePersona(t, 'Unrelated U', crypto.randomUUID(), null);

      await fn({ t, M, R, U, userM });
    } finally {
      resetPeopleDb();
      resetCoreDb();
      await closePools();
    }
  });
}

describe('getWorker — relationship scope', () => {
  it('scoped viewer (manager) can read own worker profile', async () => {
    await withDb(async ({ t, M, userM }) => {
      const session = buildSession({
        tenant_id: t.tenant_id,
        user_id: userM,
        roles: ['people.viewer'],
      });
      const w = await getWorker({ worker_id: M, session });
      expect(w.worker_id).toBe(M);
    });
  });

  it('scoped viewer (manager) can read direct report profile', async () => {
    await withDb(async ({ t, R, userM }) => {
      const session = buildSession({
        tenant_id: t.tenant_id,
        user_id: userM,
        roles: ['people.viewer'],
      });
      const w = await getWorker({ worker_id: R, session });
      expect(w.worker_id).toBe(R);
    });
  });

  it('scoped viewer (manager) cannot read out-of-scope worker profile', async () => {
    await withDb(async ({ t, U, userM }) => {
      const session = buildSession({
        tenant_id: t.tenant_id,
        user_id: userM,
        roles: ['people.viewer'],
      });
      await expect(getWorker({ worker_id: U, session })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  it('read.all session can read any worker profile regardless of relationship', async () => {
    await withDb(async ({ t, U }) => {
      const w = await getWorker({ worker_id: U, session: t.adminSession });
      expect(w.worker_id).toBe(U);
    });
  });
});

describe('getWorkerHistory — relationship scope', () => {
  it('scoped viewer (manager) can read direct report history', async () => {
    await withDb(async ({ t, R, userM }) => {
      const session = buildSession({
        tenant_id: t.tenant_id,
        user_id: userM,
        roles: ['people.viewer'],
      });
      const rows = await getWorkerHistory({ worker_id: R, session });
      expect(Array.isArray(rows)).toBe(true);
    });
  });

  it('scoped viewer (manager) cannot read out-of-scope worker history', async () => {
    await withDb(async ({ t, U, userM }) => {
      const session = buildSession({
        tenant_id: t.tenant_id,
        user_id: userM,
        roles: ['people.viewer'],
      });
      await expect(getWorkerHistory({ worker_id: U, session })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  it('read.all session can read any worker history regardless of relationship', async () => {
    await withDb(async ({ t, U }) => {
      const rows = await getWorkerHistory({ worker_id: U, session: t.adminSession });
      expect(Array.isArray(rows)).toBe(true);
    });
  });
});
