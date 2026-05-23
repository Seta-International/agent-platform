import { registerCopilotContributions } from '@seta/copilot/register';
import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { registerIdentityContributions } from '@seta/identity/register';
import { registerIntegrationsContributions } from '@seta/integrations/register';
import { registerKnowledgeContributions } from '@seta/knowledge/register';
import { registerNotificationsContributions } from '@seta/notifications/register';
import { registerPlannerContributions } from '@seta/planner/register';
import { getPool } from '@seta/shared-db';
import { registerStaffingContributions } from '@seta/staffing/register';
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
  registerCopilotContributions(reg);
  await runMigrations(reg, { pool: getPool('worker') });
  log.info('migrations applied');
}
