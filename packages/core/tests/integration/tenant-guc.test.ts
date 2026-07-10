import { randomUUID } from 'node:crypto';
import { maintenance, scoped } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withEmit } from '../../src/events/index.ts';
import { withCoreTestDb } from '../helpers.ts';

describe('tenant GUC wiring', () => {
  it('withEmit sets app.tenant_id transaction-locally from the actor', async () => {
    await withCoreTestDb(async () => {
      const tenantId = randomUUID();
      await scoped(tenantId, () =>
        withEmit({ actor: { userId: 'u1', tenantId } }, async (tx) => {
          const r = await tx.execute(sql`SELECT current_setting('app.tenant_id', true) AS t`);
          expect((r.rows[0] as { t: string }).t).toBe(tenantId);
        }),
      );
    });
  });

  it('withEmit without an actor leaves the GUC unset', async () => {
    await withCoreTestDb(async () => {
      // maintenance(), not scoped(): scoped() pins a tenant-bound connection whose
      // facade sets app.tenant_id itself (see request-tenant.ts's acquire()), which
      // would poison this assertion regardless of what withEmit does with no actor.
      // The admin pool under maintenance() sets no GUC at all.
      await maintenance(() =>
        withEmit(undefined, async (tx) => {
          const r = await tx.execute(sql`SELECT current_setting('app.tenant_id', true) AS t`);
          expect((r.rows[0] as { t: string | null }).t ?? '').toBe('');
        }),
      );
    });
  });
});
