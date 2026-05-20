import { eq } from 'drizzle-orm';
import { integrationsDb } from '../../db/client.ts';
import { mailTransportConfig } from '../../db/schema/index.ts';
import { INTEGRATIONS_PERMISSIONS, IntegrationsError } from '../rbac.ts';
import type { MailTransportConfigRow } from './mail-transport-config-store.ts';

export interface Actor {
  user_id: number;
  tenantId: string;
  permissions: ReadonlySet<string>;
}

function requirePerm(actor: Actor, perm: string): void {
  if (!actor.permissions.has(perm))
    throw new IntegrationsError('FORBIDDEN', `missing permission ${perm}`);
}

export async function getMailTransportConfig(
  tenantId: string,
  actor: Actor,
): Promise<MailTransportConfigRow | null> {
  requirePerm(actor, INTEGRATIONS_PERMISSIONS.mailConfigure);
  if (actor.tenantId !== tenantId) throw new IntegrationsError('FORBIDDEN', 'tenant mismatch');
  const [row] = await integrationsDb()
    .select()
    .from(mailTransportConfig)
    .where(eq(mailTransportConfig.tenantId, tenantId))
    .limit(1);
  if (!row?.enabled) return null;
  return row;
}
