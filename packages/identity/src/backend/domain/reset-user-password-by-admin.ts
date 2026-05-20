import { emit, withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { account } from '../../db/schema.ts';
import { argon2id } from '../password/argon2.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';

const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_';

function generatePassword(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let out = '';
  for (const b of buf) out += PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length];
  return out;
}

export interface ResetPasswordByAdminInput {
  tenant_id: string;
  user_id: string;
}

export async function resetUserPasswordByAdmin(
  input: ResetPasswordByAdminInput,
  actor: Actor,
): Promise<{ password: string }> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.user.write', input.tenant_id);
  }

  const password = generatePassword();
  const passwordHash = await argon2id.hash(password);

  await withEmit(
    {
      actor: {
        userId: actor.user_id ?? 'system',
        tenantId: input.tenant_id,
        ip: actor.ip,
        userAgent: actor.user_agent,
      },
    },
    async (tx) => {
      const updated = await tx
        .update(account)
        .set({ password: passwordHash, updated_at: new Date() })
        .where(and(eq(account.user_id, input.user_id), eq(account.provider_id, 'credential')))
        .returning({ id: account.id });
      if (updated.length === 0) {
        throw new IdentityError('NO_LOCAL_PASSWORD', 'User has no local password to reset');
      }
      await emit({
        tenantId: input.tenant_id,
        aggregateType: 'identity.user',
        aggregateId: input.user_id,
        eventType: 'identity.user.password_reset.by_admin',
        eventVersion: 1,
        payload: {
          actor: {
            type: actor.type,
            user_id: actor.user_id,
            ip: actor.ip,
            user_agent: actor.user_agent,
          },
          user_id: input.user_id,
          tenant_id: input.tenant_id,
        },
      });
    },
  );

  return { password };
}
