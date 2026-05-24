import { eq } from 'drizzle-orm';
import { integrationsDb } from '../../db/client.ts';
import { mailTransportConfig } from '../../db/schema/index.ts';
import { INTEGRATIONS_PERMISSIONS, IntegrationsError, requirePermission } from '../rbac.ts';
import type { MailTransportConfigRow } from './mail-transport-config-store.ts';

export interface Actor {
  user_id: number;
  tenantId: string;
  permissions: ReadonlySet<string>;
}

export async function getMailTransportConfig(
  tenantId: string,
  actor: Actor,
): Promise<MailTransportConfigRow | null> {
  requirePermission(actor, INTEGRATIONS_PERMISSIONS.mailConfigure);
  if (actor.tenantId !== tenantId) throw new IntegrationsError('FORBIDDEN', 'tenant mismatch');
  const [row] = await integrationsDb()
    .select()
    .from(mailTransportConfig)
    .where(eq(mailTransportConfig.tenantId, tenantId))
    .limit(1);
  if (!row?.enabled) return null;
  return row;
}
