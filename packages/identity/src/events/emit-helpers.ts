import { emit } from '@seta/core/events';
import type {
  IdentityRoleGrantChanged,
  IdentityUserCreated,
  IdentityUserDeactivated,
  IdentityUserProfileUpdated,
} from './types.ts';

export async function emitIdentityUserCreated(args: {
  actor: IdentityUserCreated['payload']['actor'];
  after: IdentityUserCreated['payload']['after'];
}): Promise<void> {
  await emit({
    tenantId: args.after.tenant_id,
    aggregateType: 'identity.user',
    aggregateId: args.after.user_id,
    eventType: 'identity.user.created',
    eventVersion: 1,
    payload: { actor: args.actor, after: args.after },
  });
}

export async function emitIdentityUserProfileUpdated(args: {
  actor: IdentityUserProfileUpdated['payload']['actor'];
  user_id: string;
  tenant_id: string;
  before: IdentityUserProfileUpdated['payload']['before'];
  after: IdentityUserProfileUpdated['payload']['after'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'identity.user',
    aggregateId: args.user_id,
    eventType: 'identity.user.profile.updated',
    eventVersion: 1,
    payload: { actor: args.actor, user_id: args.user_id, before: args.before, after: args.after },
  });
}

export async function emitIdentityUserDeactivated(args: {
  actor: IdentityUserDeactivated['payload']['actor'];
  user_id: string;
  tenant_id: string;
  deactivated_at: Date;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'identity.user',
    aggregateId: args.user_id,
    eventType: 'identity.user.deactivated',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      user_id: args.user_id,
      tenant_id: args.tenant_id,
      deactivated_at: args.deactivated_at.toISOString(),
    },
  });
}

export async function emitIdentityRoleGrantChanged(args: {
  actor: IdentityRoleGrantChanged['payload']['actor'];
  user_id: string;
  tenant_id: string;
  change: 'granted' | 'revoked';
  grant: IdentityRoleGrantChanged['payload']['grant'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'identity.user',
    aggregateId: args.user_id,
    eventType: 'identity.role_grant.changed',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      user_id: args.user_id,
      tenant_id: args.tenant_id,
      change: args.change,
      grant: args.grant,
    },
  });
}
