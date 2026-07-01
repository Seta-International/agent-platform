import type { SessionScope } from '@seta/core';
import { grantProductAccess } from '@seta/identity';
import { PRODUCT_IDS } from '@seta/shared-rbac';
import { ensurePersonaGroups } from '../lib/access-groups.ts';

export async function seedAccessGroups(session: SessionScope): Promise<Map<string, string>> {
  const cliActor = { type: 'cli' as const, user_id: session.user_id };
  const groups = await ensurePersonaGroups(session, cliActor);

  for (const product_id of PRODUCT_IDS) {
    await grantProductAccess(
      {
        tenant_id: session.tenant_id,
        subject_type: 'tenant',
        subject_id: session.tenant_id,
        product_id,
        effect: 'grant',
        granted_via: 'seed',
      },
      cliActor,
    );
  }

  return groups;
}
