import { registerAgentContributions } from '@seta/agent/register';
import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { registerIdentityContributions } from '@seta/identity/register';
import { registerIntegrationsContributions } from '@seta/integrations/register';
import { registerKnowledgeContributions } from '@seta/knowledge/register';
import { registerNotificationsContributions } from '@seta/notifications/register';
import { registerPerformanceContributions } from '@seta/performance/register';
import { registerPlannerContributions } from '@seta/planner/register';
import { getPool } from '@seta/shared-db';
import { registerStaffingContributions } from '@seta/staffing/register';
// MODULE_IMPORTS_END — generator inserts new register*Contributions imports above this comment.
import pino from 'pino';

const log = pino({ name: 'cli/migrate' });

export async function migrateCommand(): Promise<void> {
  const reg = createContributionRegistry();
  registerCoreContributions(reg);
  registerIdentityContributions(reg);
  registerIntegrationsContributions(reg);
  registerKnowledgeContributions(reg);
  registerNotificationsContributions(reg);
  registerPlannerContributions(reg);
  registerStaffingContributions(reg);
  registerAgentContributions(reg);
  registerPerformanceContributions(reg);
  // MODULE_REGISTRATIONS_END — generator inserts new register*Contributions(reg) calls above this comment.
  await runMigrations(reg, { pool: getPool('worker') });
  log.info('migrations applied');
}
