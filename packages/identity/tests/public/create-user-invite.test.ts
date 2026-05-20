import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { FakeMailer } from '@seta/shared-mailer/testing';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';

describe('createUser with invite option (D27 reversal)', () => {
  it('sends an invite email when mailer is supplied', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Acme', $2)`, [
            tenantId,
            `acme-${tenantId.slice(0, 8)}`,
          ]);
          const mailer = new FakeMailer();
          const result = await createUser(
            {
              tenant_id: tenantId,
              email: 'alex@acme.test',
              name: 'Alex',
              password: 'P@ssw0rd0011',
            },
            { type: 'cli', user_id: null },
            {
              mailer,
              baseUrl: 'https://app.seta.example',
              tenantName: 'Acme',
              inviterName: 'System',
            },
          );
          expect(mailer.sent).toHaveLength(1);
          expect(mailer.sent[0]!.template).toBe('invite');
          expect(mailer.sent[0]!.dedupeKey).toBe(`invite:${result.user_id}`);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('does not send invite when mailer not supplied', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Acme', $2)`, [
            tenantId,
            `acme-${tenantId.slice(0, 8)}`,
          ]);
          const result = await createUser(
            {
              tenant_id: tenantId,
              email: 'silent@acme.test',
              name: 'Silent',
              password: 'P@ssw0rd0011',
            },
            { type: 'cli', user_id: null },
          );
          expect(result.user_id).toMatch(/^[0-9a-f-]{36}$/);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
