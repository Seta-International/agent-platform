import { describe, expect, it } from 'vitest';
import { commitActualTokens, reserveTurn } from '../src/backend/rate-limit.ts';
import { withCopilotTestDb } from './test-helpers.ts';

const TENANT = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

describe('rate-limit', () => {
  it('allows under-limit reserves and rejects over-limit', async () => {
    await withCopilotTestDb(async () => {
      for (let i = 0; i < 10; i++) {
        await reserveTurn({
          tenantId: TENANT,
          userId: USER,
          estimatedTokens: 500,
          turnLimit: 10,
          tpmLimit: 60_000,
        });
      }
      await expect(
        reserveTurn({
          tenantId: TENANT,
          userId: USER,
          estimatedTokens: 500,
          turnLimit: 10,
          tpmLimit: 60_000,
        }),
      ).rejects.toMatchObject({ code: 'rate_limited' });
    });
  });

  it('commitActualTokens overwrites the estimate', async () => {
    await withCopilotTestDb(async () => {
      await reserveTurn({
        tenantId: TENANT,
        userId: USER,
        estimatedTokens: 1000,
        turnLimit: 10,
        tpmLimit: 60_000,
      });
      await commitActualTokens({ tenantId: TENANT, userId: USER, tokensIn: 50, tokensOut: 100 });
      await reserveTurn({
        tenantId: TENANT,
        userId: USER,
        estimatedTokens: 100,
        turnLimit: 10,
        tpmLimit: 60_000,
      });
    });
  });
});
