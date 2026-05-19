import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { updateUserProfile } from '../../src/backend/domain/update-user-profile.ts';
import { registerIdentityContributions } from '../../src/register.ts';

describe('updateUserProfile', () => {
  async function setup(
    pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    databaseUrl: string,
  ) {
    const reg = createContributionRegistry();
    registerCoreContributions(reg);
    registerIdentityContributions(reg);
    await runMigrations(reg, { pool: pool as Parameters<typeof runMigrations>[1]['pool'] });
    initPools({ databaseUrl });
    const tenantId = crypto.randomUUID();
    await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`, [
      tenantId,
    ]);
    const { user_id } = await createUser(
      { tenant_id: tenantId, email: 'a@d.local', name: 'A', password: 'demo-password-1234' },
      { type: 'cli', user_id: null },
    );
    return { tenantId, userId: user_id };
  }

  it('updates display_name and emits identity.user.profile.updated with before/after diff', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { userId } = await setup(pool, databaseUrl);
        try {
          const result = await updateUserProfile(
            userId,
            { display_name: 'A2' },
            { type: 'user', user_id: userId },
          );
          expect(result.display_name).toBe('A2');

          const event = (
            await pool.query(
              `SELECT payload FROM core.events WHERE event_type = 'identity.user.profile.updated'`,
            )
          ).rows[0] as {
            payload: { before: Record<string, unknown>; after: Record<string, unknown> };
          };
          expect(event.payload.before).toEqual({ display_name: 'A' });
          expect(event.payload.after).toEqual({ display_name: 'A2' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('lowercases and dedupes skills', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { userId } = await setup(pool, databaseUrl);
        try {
          const result = await updateUserProfile(
            userId,
            { skills: ['Rust', 'rust', 'TypeScript'] },
            { type: 'user', user_id: userId },
          );
          expect(result.skills).toEqual(['rust', 'typescript']);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('does not emit when patch is a no-op', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { userId } = await setup(pool, databaseUrl);
        try {
          await updateUserProfile(userId, { timezone: 'UTC' }, { type: 'user', user_id: userId });
          const count = (
            await pool.query(
              `SELECT count(*)::int AS n FROM core.events WHERE event_type = 'identity.user.profile.updated'`,
            )
          ).rows[0] as { n: number };
          expect(count.n).toBe(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
