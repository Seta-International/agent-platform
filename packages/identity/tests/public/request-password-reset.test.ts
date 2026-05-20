import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { FakeMailer } from '@seta/shared-mailer/testing';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { requestPasswordReset } from '../../src/backend/domain/request-password-reset.ts';

describe('requestPasswordReset', () => {
  it('sends a password-reset email with the IP recorded', async () => {
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
          await createUser(
            {
              tenant_id: tenantId,
              email: 'a@b.com',
              name: 'A',
              password: 'P@ssw0rd0011',
            },
            { type: 'cli', user_id: null },
          );
          const mailer = new FakeMailer();
          await requestPasswordReset({
            tenantId,
            email: 'a@b.com',
            baseUrl: 'https://app.seta.example',
            requestedFromIp: '192.0.2.10',
            mailer,
          });
          expect(mailer.sent[0]!.template).toBe('password-reset');
          const props = mailer.sent[0]!.props as { requestedFromIp: string };
          expect(props.requestedFromIp).toBe('192.0.2.10');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('silently does nothing for an unknown email (no enumeration)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const mailer = new FakeMailer();
          await requestPasswordReset({
            tenantId,
            email: 'ghost@nope.com',
            baseUrl: 'https://x',
            requestedFromIp: '1.1.1.1',
            mailer,
          });
          expect(mailer.sent).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
