import pino from 'pino';
import { resolveTenantId } from '../lib/tenant-resolve.ts';
import { buildAdminSession } from '../seed.ts';
import { loadFixtures } from './load.ts';
import { seedPeopleIdentity } from './phase-people-identity.ts';
import { seedPm } from './phase-pm.ts';

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

  const people = await seedPeopleIdentity(session, fx.employees, opts.password ?? 'ChangeMe@2026');
  log.info({ people: people.size }, 'phase: people+identity done');

  const pm = await seedPm(session, fx.projects, fx.allocations, people);
  log.info({ accounts: pm.accountByName.size, projects: pm.projectByCode.size }, 'phase: pm done');

  // Tasks 6–8 append phases here, in order. Each phase is a separate module file
  // imported and called with (session, fx, ctx) where ctx accumulates id maps.

  log.info({ tenant_id: tenantId }, 'seed-fixture: complete');
}
