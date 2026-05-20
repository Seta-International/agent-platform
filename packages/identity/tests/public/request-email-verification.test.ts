import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { FakeMailer } from '@seta/shared-mailer/testing';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { requestEmailVerification } from '../../src/backend/domain/request-email-verification.ts';

describe('requestEmailVerification', () => {
  it('sends a verify-email message with a one-shot dedupe key', async () => {
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
              email: 'alex@acme.test',
              name: 'Alex',
              password: 'P@ssw0rd0011',
            },
            { type: 'cli', user_id: null },
          );
          const mailer = new FakeMailer();
          await requestEmailVerification({
            tenantId,
            userId: result.user_id,
            baseUrl: 'https://app.seta.example',
            mailer,
          });
          expect(mailer.sent).toHaveLength(1);
          expect(mailer.sent[0]!.template).toBe('verify-email');
          expect(mailer.sent[0]!.dedupeKey).toMatch(/^verify-email:/);
          const props = mailer.sent[0]!.props as { verifyUrl: string };
          expect(props.verifyUrl).toContain('https://app.seta.example/verify?');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('a re-request creates a new nonce (different dedupeKey)', async () => {
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
              email: 'alex@acme.test',
              name: 'Alex',
              password: 'P@ssw0rd0011',
            },
            { type: 'cli', user_id: null },
          );
          const mailer = new FakeMailer();
          await requestEmailVerification({
            tenantId,
            userId: result.user_id,
            baseUrl: 'https://app.seta.example',
            mailer,
          });
          await requestEmailVerification({
            tenantId,
            userId: result.user_id,
            baseUrl: 'https://app.seta.example',
            mailer,
          });
          expect(mailer.sent).toHaveLength(2);
          expect(mailer.sent[0]!.dedupeKey).not.toBe(mailer.sent[1]!.dedupeKey);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
