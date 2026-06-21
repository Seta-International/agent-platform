import pino from 'pino';
import { resolveTenantId } from '../lib/tenant-resolve.ts';
import { buildAdminSession } from '../seed.ts';
import { loadFixtures } from './load.ts';

const log = pino({ name: 'cli/seed-fixture' });

export async function seedFixtureCommand(opts: {
  tenant: string;
  dir: string;
  adminEmail: string;
  password?: string;
}): Promise<void> {
  const tenantId = await resolveTenantId(opts.tenant);
  const session = await buildAdminSession(tenantId, opts.adminEmail);
  const fx = loadFixtures(opts.dir);
  log.info(
    {
      employees: fx.employees.length,
      projects: fx.projects.length,
      allocations: fx.allocations.length,
    },
    'fixtures loaded',
  );

  // Tasks 4–8 append phases here, in order. Each phase is a separate module file
  // imported and called with (session, fx, ctx) where ctx accumulates id maps.
  void session;

  log.info({ tenant_id: tenantId }, 'seed-fixture: complete');
}
