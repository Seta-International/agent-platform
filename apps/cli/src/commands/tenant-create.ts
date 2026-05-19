import { coreTenants } from '@seta/core/db/schema';
import { emit, withEmit } from '@seta/core/events';
import pino from 'pino';

const log = pino({ name: 'cli/tenant-create' });

export async function tenantCreateCommand(opts: { name: string; slug: string }): Promise<void> {
  const id = crypto.randomUUID();
  await withEmit(
    { actor: { userId: 'cli', tenantId: '00000000-0000-0000-0000-000000000000' } },
    async (tx) => {
      await tx.insert(coreTenants).values({ id, name: opts.name, slug: opts.slug });
      await emit({
        tenantId: id,
        aggregateType: 'core.tenant',
        aggregateId: id,
        eventType: 'core.tenant.created',
        eventVersion: 1,
        payload: { tenantId: id, name: opts.name, slug: opts.slug },
      });
    },
  );
  log.info({ id, name: opts.name, slug: opts.slug }, 'tenant created');
}
