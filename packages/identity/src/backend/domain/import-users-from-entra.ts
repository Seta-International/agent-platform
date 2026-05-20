import { requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';
import { createUser } from './create-user.ts';
import { listEntraImportableUsers } from './list-entra-importable-users.ts';

export interface ImportUsersFromEntraInput {
  tenant_id: string;
  selected_oids: ReadonlyArray<string>;
}

function generateRandomPassword(length = 32): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_';
  let s = '';
  for (let i = 0; i < length; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export async function importUsersFromEntra(
  input: ImportUsersFromEntraInput,
  actor: Actor,
): Promise<{
  imported: ReadonlyArray<string>;
  skipped: ReadonlyArray<{ entra_oid: string; reason: string }>;
}> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new Error('user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.user.write', input.tenant_id);
  }

  const universe = await listEntraImportableUsers(input.tenant_id);
  const selectedSet = new Set(input.selected_oids);
  // Only process users that are both selected and account_enabled in Entra
  const selected = universe.filter((u) => selectedSet.has(u.entra_oid) && u.account_enabled);

  const imported: string[] = [];
  const skipped: { entra_oid: string; reason: string }[] = [];

  for (const g of selected) {
    if (g.already_in_seta) {
      skipped.push({ entra_oid: g.entra_oid, reason: 'already_exists' });
      continue;
    }
    try {
      const { user_id } = await createUser(
        {
          tenant_id: input.tenant_id,
          email: g.email,
          name: g.display_name,
          password: generateRandomPassword(),
        },
        {
          // RBAC already enforced above for user actors; use sso actor to bypass inner check
          type: 'sso',
          user_id: actor.user_id ?? null,
          ip: actor.ip,
          user_agent: actor.user_agent,
        },
      );
      imported.push(user_id);
    } catch (err) {
      const msg = (err as Error).message;
      if (/unique/i.test(msg) || /EMAIL_TAKEN/i.test(msg)) {
        skipped.push({ entra_oid: g.entra_oid, reason: 'already_exists' });
      } else {
        skipped.push({ entra_oid: g.entra_oid, reason: msg });
      }
    }
  }

  return { imported, skipped };
}
