import { registerAgentContributions } from '@seta/agent/register';
import { type ContributionRegistry, createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { registerHiringContributions } from '@seta/hiring/register';
import { registerIdentityContributions } from '@seta/identity/register';
import { registerIntegrationsContributions } from '@seta/integrations/register';
import { registerKnowledgeContributions } from '@seta/knowledge/register';
import { registerNotificationsContributions } from '@seta/notifications/register';
import { registerPeopleContributions } from '@seta/people/register';
import { registerPlannerContributions } from '@seta/planner/register';
import { registerPmContributions } from '@seta/pm/register';
import { getPool } from '@seta/shared-db';
import { registerStaffingContributions } from '@seta/staffing/register';
// MODULE_IMPORTS_END — generator inserts new register*Contributions imports above this comment.
import pino from 'pino';

const log = pino({ name: 'cli/migrate' });

export function buildMigrationRegistry(): ContributionRegistry {
  const reg = createContributionRegistry();
  registerCoreContributions(reg);
  registerIdentityContributions(reg);
  registerIntegrationsContributions(reg);
  registerKnowledgeContributions(reg);
  registerNotificationsContributions(reg);
  registerPlannerContributions(reg);
  registerStaffingContributions(reg);
  registerAgentContributions(reg);
  registerPeopleContributions(reg);
  registerHiringContributions(reg);
  registerPmContributions(reg);
  // MODULE_REGISTRATIONS_END — generator inserts new register*Contributions(reg) calls above this comment.
  return reg;
}

export async function migrateCommand(): Promise<void> {
  const reg = buildMigrationRegistry();
  await runMigrations(reg, { pool: getPool('worker') });
  log.info('migrations applied');
}
