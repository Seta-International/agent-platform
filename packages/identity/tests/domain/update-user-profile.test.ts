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

  it('round-trips working_hours and emits the diff', async () => {
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
            { working_hours: { start: '09:00', end: '18:00' } },
            { type: 'user', user_id: userId },
          );
          expect(result.working_hours).toEqual({ start: '09:00', end: '18:00' });

          const event = (
            await pool.query(
              `SELECT payload FROM core.events WHERE event_type = 'identity.user.profile.updated'`,
            )
          ).rows[0] as {
            payload: { before: Record<string, unknown>; after: Record<string, unknown> };
          };
          expect(event.payload.before).toEqual({ working_hours: null });
          expect(event.payload.after).toEqual({
            working_hours: { start: '09:00', end: '18:00' },
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('admin can update another user with identity.user.write; non-admin cannot', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool: pool as Parameters<typeof runMigrations>[1]['pool'] });
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', $2)`, [
            tenantId,
            `t-${tenantId.slice(0, 8)}`,
          ]);
          const { user_id: adminId } = await createUser(
            {
              tenant_id: tenantId,
              email: 'admin@t.local',
              name: 'Admin',
              password: 'admin-password-1234',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );
          const { user_id: viewerId } = await createUser(
            {
              tenant_id: tenantId,
              email: 'viewer@t.local',
              name: 'Viewer',
              password: 'viewer-password-1234',
              initial_role: { role_slug: 'identity.viewer', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );
          const { user_id: subjectId } = await createUser(
            {
              tenant_id: tenantId,
              email: 's@t.local',
              name: 'S',
              password: 'subject-password-1234',
            },
            { type: 'cli', user_id: null },
          );

          const result = await updateUserProfile(
            subjectId,
            { skills: ['typescript'], working_hours: { start: '09:00', end: '17:00' } },
            { type: 'user', user_id: adminId },
          );
          expect(result.skills).toEqual(['typescript']);
          expect(result.working_hours).toEqual({ start: '09:00', end: '17:00' });

          await expect(
            updateUserProfile(subjectId, { skills: ['rust'] }, { type: 'user', user_id: viewerId }),
          ).rejects.toThrow();
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
