import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import { resolveTenantId } from '../lib/tenant-resolve.ts';
import { buildAdminSession } from '../seed.ts';
import { tenantCreateCommand } from '../tenant-create.ts';
import { FIXTURE_FILE, loadFixtures } from './load.ts';
import { seedEdgeCases } from './phase-edge-cases.ts';
import { seedHiring } from './phase-hiring.ts';
import { seedOrgStructure } from './phase-org-structure.ts';
import { seedPeopleIdentity } from './phase-people-identity.ts';
import { seedPlanner } from './phase-planner.ts';
import { seedPm } from './phase-pm.ts';
import { seedSkillCatalog } from './phase-skills.ts';

const log = pino({ name: 'cli/seed-fixture' });

export async function seedFixtureCommand(opts: {
  tenant: string;
  dir: string;
  adminEmail: string;
  password?: string;
  tenantName?: string;
}): Promise<void> {
  const password = opts.password ?? 'ChangeMe@2026';

  let tenantId = await resolveTenantId(opts.tenant).catch(() => null);
  if (!tenantId) {
    log.info({ slug: opts.tenant }, 'tenant missing — bootstrapping tenant + admin');
    await tenantCreateCommand({
      name: opts.tenantName ?? opts.tenant,
      slug: opts.tenant,
      adminEmail: opts.adminEmail,
      adminPassword: password,
    });
    tenantId = await resolveTenantId(opts.tenant);
  }

  const session = await buildAdminSession(tenantId, opts.adminEmail);

  // The fixture workbook holds real employee PII and is gitignored, so a fresh clone
  // won't have it. Degrade gracefully: tenant + admin are already provisioned above.
  if (!existsSync(join(opts.dir, FIXTURE_FILE))) {
    log.warn(
      { dir: opts.dir, file: FIXTURE_FILE },
      'fixture workbook absent (gitignored PII) — seeded tenant + admin only',
    );
    log.info({ tenant_id: tenantId }, 'seed-fixture: complete');
    return;
  }

  const fx = loadFixtures(opts.dir);
  log.info(
    {
      employees: fx.employees.length,
      projects: fx.projects.length,
      allocations: fx.allocations.length,
    },
    'fixtures loaded',
  );

  const skills = await seedSkillCatalog(session);
  log.info({ skills: skills.size }, 'phase: skills done');

  const people = await seedPeopleIdentity(session, fx.employees, password, skills);
  log.info({ people: people.size }, 'phase: people+identity done');

  const pm = await seedPm(session, fx.projects, fx.allocations, people);
  log.info({ accounts: pm.accountByName.size, projects: pm.projectByCode.size }, 'phase: pm done');

  await seedOrgStructure(session, fx.employees, fx.projects, fx.allocations, fx.leadership, people);
  log.info('phase: org-structure done');

  await seedPlanner(session, fx.projects, people, pm.membersByCode, pm.projectByCode);
  log.info('phase: planner done');

  await seedHiring(session, pm.accountByName, skills);
  log.info('phase: hiring done');

  await seedEdgeCases(session, people, fx.employees);
  log.info('phase: edge-cases done');

  log.info({ tenant_id: tenantId }, 'seed-fixture: complete');
}
