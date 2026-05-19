import { coreEvents, coreTenants } from '@seta/core/db/schema';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { tenantCreateCommand } from '../src/commands/tenant-create.ts';
import { withCliTestDb } from '../test/test-helpers.ts';

describe('tenant-create', () => {
  it('inserts a tenant row + emits core.tenant.created in the same tx', async () => {
    await withCliTestDb(async ({ db }) => {
      resetCoreDb();
      await tenantCreateCommand({ name: 'Acme Inc', slug: 'acme' });

      const tenants = await db.select().from(coreTenants).where(eq(coreTenants.slug, 'acme'));
      expect(tenants).toHaveLength(1);

      const events = await db
        .select()
        .from(coreEvents)
        .where(eq(coreEvents.eventType, 'core.tenant.created'));
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({ name: 'Acme Inc', slug: 'acme' });
    });
  });
});
