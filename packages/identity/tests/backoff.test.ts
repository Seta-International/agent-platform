import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { computeBackoffSeconds, recordFailedAttempt } from '../src/backend/password/backoff.ts';
import { registerIdentityContributions } from '../src/register.ts';

describe('progressive backoff', () => {
  it('returns 0 for first two attempts, escalates per schedule, caps at 5 minutes', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const email = 'a@d.local';
          const ip = '127.0.0.1';
          expect(await computeBackoffSeconds(email, ip)).toBe(0);
          await recordFailedAttempt(email, ip, 'bad_password');
          await recordFailedAttempt(email, ip, 'bad_password');
          expect(await computeBackoffSeconds(email, ip)).toBe(0); // 2 fails → 0s
          await recordFailedAttempt(email, ip, 'bad_password');
          expect(await computeBackoffSeconds(email, ip)).toBe(1); // 3rd → 1s
          await recordFailedAttempt(email, ip, 'bad_password');
          expect(await computeBackoffSeconds(email, ip)).toBe(5); // 4th → 5s
          // jump to 11 failures total
          for (let i = 0; i < 7; i++) await recordFailedAttempt(email, ip, 'bad_password');
          expect(await computeBackoffSeconds(email, ip)).toBe(300); // capped at 5 min
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('treats unknown_email same as known (anti-enumeration)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          await recordFailedAttempt('nope@d.local', '127.0.0.1', 'unknown_email');
          await recordFailedAttempt('nope@d.local', '127.0.0.1', 'unknown_email');
          await recordFailedAttempt('nope@d.local', '127.0.0.1', 'unknown_email');
          expect(await computeBackoffSeconds('nope@d.local', '127.0.0.1')).toBe(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

describe('failed-login alert threshold', () => {
  it('emits the alert event on the exact 5th failure within 15 minutes', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          for (let i = 0; i < 5; i++) {
            await recordFailedAttempt('victim@example.com', '1.2.3.4', 'bad_password');
          }
          const r = await pool.query(
            `SELECT COUNT(*)::int AS n FROM core.events WHERE event_type = 'identity.failed_login.alert_threshold_reached'`,
          );
          expect(r.rows[0]?.n).toBe(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('does not re-emit on the 6th, 7th, … failures within the same hour', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          for (let i = 0; i < 8; i++) {
            await recordFailedAttempt('victim@example.com', '1.2.3.4', 'bad_password');
          }
          const r = await pool.query(
            `SELECT COUNT(*)::int AS n FROM core.events WHERE event_type = 'identity.failed_login.alert_threshold_reached'`,
          );
          expect(r.rows[0]?.n).toBe(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rate-limits via failed_login_alerts_sent: seeding a recent send blocks a fresh threshold cross', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          await pool.query(
            `INSERT INTO identity.failed_login_alerts_sent (email, last_sent_at) VALUES ($1, now() - interval '30 minutes')`,
            ['victim@example.com'],
          );
          for (let i = 0; i < 5; i++) {
            await recordFailedAttempt('victim@example.com', '1.2.3.4', 'bad_password');
          }
          const r = await pool.query(
            `SELECT COUNT(*)::int AS n FROM core.events WHERE event_type = 'identity.failed_login.alert_threshold_reached'`,
          );
          expect(r.rows[0]?.n).toBe(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('unknown email still emits but with reset_url=null', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          for (let i = 0; i < 5; i++) {
            await recordFailedAttempt('nobody@example.com', '1.2.3.4', 'unknown_email');
          }
          const r = await pool.query(
            `SELECT payload FROM core.events WHERE event_type = 'identity.failed_login.alert_threshold_reached'`,
          );
          expect(r.rows).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          expect((r.rows[0]?.payload as any).reset_url).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
