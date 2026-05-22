import { emit, withEmit } from '@seta/core/events';
import type { Mailer } from '@seta/shared-mailer';
import { account, roleGrants, user, userProfile } from '../../db/schema.ts';
import { argon2id } from '../password/argon2.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { isValidEmail } from './_email.ts';

export interface Actor {
  type: 'user' | 'cli' | 'superadmin' | 'sso';
  user_id: string | null;
  ip?: string;
  user_agent?: string;
}

export interface CreateUserInput {
  tenant_id: string;
  email: string;
  name: string;
  password: string;
  initial_role?: {
    role_slug: string;
    scope_type: 'tenant' | 'group';
    scope_id: string | null;
  };
}

/**
 * Optional invite email knob for D27 reversal. When `mailer` is supplied,
 * an `invite` template email is sent after the user row commits. Caller
 * provides `baseUrl`, `tenantName`, and the inviter's display name. The
 * invite link doubles as proof of email control.
 */
export interface CreateUserInviteOpts {
  mailer: Mailer;
  baseUrl: string;
  tenantName: string;
  inviterName: string;
  ttlMs?: number;
}

export async function createUser(
  input: CreateUserInput,
  actor: Actor,
  invite?: CreateUserInviteOpts,
): Promise<{ user_id: string }> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.user.write', input.tenant_id);
  }

  const email = input.email.toLowerCase().trim();
  if (!isValidEmail(email)) throw new IdentityError('INVALID_EMAIL', `Not a valid email: ${email}`);
  // CLI is a trusted internal actor; only enforce the floor for web/user-submitted passwords.
  const minLen = actor.type === 'cli' ? 1 : 12;
  if (input.password.length < minLen || input.password.length > 128) {
    throw new IdentityError('PASSWORD_LENGTH', 'Password must be 12-128 characters.');
  }

  const userId = crypto.randomUUID();
  const passwordHash = await argon2id.hash(input.password);
  const grantedVia: 'cli' | 'admin' = actor.type === 'cli' ? 'cli' : 'admin';

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
      await tx.insert(user).values({
        id: userId,
        email,
        name: input.name,
        email_verified: true,
        tenant_id: input.tenant_id,
      });
      await tx.insert(account).values({
        id: crypto.randomUUID(),
        user_id: userId,
        provider_id: 'credential',
        account_id: userId,
        password: passwordHash,
      });
      await tx.insert(userProfile).values({ user_id: userId, tenant_id: input.tenant_id });

      if (input.initial_role) {
        const grantId = crypto.randomUUID();
        await tx.insert(roleGrants).values({
          id: grantId,
          user_id: userId,
          tenant_id: input.tenant_id,
          role_slug: input.initial_role.role_slug,
          scope_type: input.initial_role.scope_type,
          scope_id: input.initial_role.scope_id,
          granted_by: actor.user_id,
          granted_via: grantedVia,
        });
        await emit({
          tenantId: input.tenant_id,
          aggregateType: 'identity.user',
          aggregateId: userId,
          eventType: 'identity.role_grant.changed',
          eventVersion: 1,
          payload: {
            actor: {
              type: actor.type,
              user_id: actor.user_id,
              ip: actor.ip,
              user_agent: actor.user_agent,
            },
            user_id: userId,
            tenant_id: input.tenant_id,
            change: 'granted',
            grant: {
              grant_id: grantId,
              ...input.initial_role,
              granted_via: grantedVia,
            },
          },
        });
      }

      await emit({
        tenantId: input.tenant_id,
        aggregateType: 'identity.user',
        aggregateId: userId,
        eventType: 'identity.user.created',
        eventVersion: 1,
        payload: {
          actor: {
            type: actor.type,
            user_id: actor.user_id,
            ip: actor.ip,
            user_agent: actor.user_agent,
          },
          after: {
            user_id: userId,
            tenant_id: input.tenant_id,
            email,
            name: input.name,
            created_via: grantedVia,
          },
        },
      });
    },
  );

  if (invite) {
    const ttl = invite.ttlMs ?? 1000 * 60 * 60 * 24 * 7;
    const expiresAt = new Date(Date.now() + ttl);
    const acceptUrl = `${invite.baseUrl.replace(/\/$/, '')}/accept?user=${encodeURIComponent(userId)}`;
    await invite.mailer.send({
      to: email,
      template: 'invite',
      props: {
        inviterName: invite.inviterName,
        tenantName: invite.tenantName,
        acceptUrl,
        expiresAt: expiresAt.toISOString(),
      },
      tenantId: input.tenant_id,
      dedupeKey: `invite:${userId}`,
    });
  }

  return { user_id: userId };
}
