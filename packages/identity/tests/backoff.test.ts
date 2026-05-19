import { createContributionRegistry, runMigrations } from '@seta/core';
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
        initPools({ databaseUrl });
        try {
          await recordFailedAttempt('nope@d.local', '127.0.0.1', 'unknown_email');
          await recordFailedAttempt('nope@d.local', '127.0.0.1', 'unknown_email');
          await recordFailedAttempt('nope@d.local', '127.0.0.1', 'unknown_email');
          expect(await computeBackoffSeconds('nope@d.local', '127.0.0.1')).toBe(1);
        } finally {
          await closePools();
        }
      },
    );
  });
});
