import { emit } from '@seta/core/events';
import type {
  IdentityEventActor,
  IdentityRoleGrantChanged,
  IdentityUserCreated,
  IdentityUserDeactivated,
  IdentityUserEmailChanged,
  IdentityUserProfileUpdated,
  IdentityUserSsoRevoked,
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

function ssoAggregateId(tenantId: string, providerId: string): string {
  return `${tenantId}:${providerId}`;
}

export async function emitIdentitySsoProviderRegistered(args: {
  actor: IdentityEventActor;
  tenant_id: string;
  entra_tenant_id: string;
  email_domains: string[];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'identity.sso_provider',
    aggregateId: ssoAggregateId(args.tenant_id, 'microsoft-entra-id'),
    eventType: 'identity.sso_provider.registered',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      after: {
        tenant_id: args.tenant_id,
        provider_id: 'microsoft-entra-id',
        entra_tenant_id: args.entra_tenant_id,
        email_domains: args.email_domains,
      },
    },
  });
}

export async function emitIdentitySsoProviderConsentGranted(args: {
  actor: IdentityEventActor;
  tenant_id: string;
  granted_by_oid: string | null;
  granted_by_email: string | null;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'identity.sso_provider',
    aggregateId: ssoAggregateId(args.tenant_id, 'microsoft-entra-id'),
    eventType: 'identity.sso_provider.consent_granted',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      tenant_id: args.tenant_id,
      provider_id: 'microsoft-entra-id',
      granted_by_oid: args.granted_by_oid,
      granted_by_email: args.granted_by_email,
    },
  });
}

export async function emitIdentitySsoProviderEnabled(args: {
  actor: IdentityEventActor;
  tenant_id: string;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'identity.sso_provider',
    aggregateId: ssoAggregateId(args.tenant_id, 'microsoft-entra-id'),
    eventType: 'identity.sso_provider.enabled',
    eventVersion: 1,
    payload: { actor: args.actor, tenant_id: args.tenant_id, provider_id: 'microsoft-entra-id' },
  });
}

export async function emitIdentitySsoProviderDisabled(args: {
  actor: IdentityEventActor;
  tenant_id: string;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'identity.sso_provider',
    aggregateId: ssoAggregateId(args.tenant_id, 'microsoft-entra-id'),
    eventType: 'identity.sso_provider.disabled',
    eventVersion: 1,
    payload: { actor: args.actor, tenant_id: args.tenant_id, provider_id: 'microsoft-entra-id' },
  });
}

export async function emitIdentitySsoProviderDisconnected(args: {
  actor: IdentityEventActor;
  tenant_id: string;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'identity.sso_provider',
    aggregateId: ssoAggregateId(args.tenant_id, 'microsoft-entra-id'),
    eventType: 'identity.sso_provider.disconnected',
    eventVersion: 1,
    payload: { actor: args.actor, tenant_id: args.tenant_id, provider_id: 'microsoft-entra-id' },
  });
}

export async function emitIdentityUserSsoLinked(args: {
  actor: IdentityEventActor;
  user_id: string;
  tenant_id: string;
  entra_oid: string;
  entra_tid: string;
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'identity.user',
    aggregateId: args.user_id,
    eventType: 'identity.user.sso_linked',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      user_id: args.user_id,
      tenant_id: args.tenant_id,
      provider_id: 'microsoft-entra-id',
      entra_oid: args.entra_oid,
      entra_tid: args.entra_tid,
    },
  });
}

export async function emitIdentityUserSsoRevoked(args: {
  actor: IdentityEventActor;
  user_id: string;
  tenant_id: string;
  reason: IdentityUserSsoRevoked['payload']['reason'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'identity.user',
    aggregateId: args.user_id,
    eventType: 'identity.user.sso_revoked',
    eventVersion: 1,
    payload: { actor: args.actor, user_id: args.user_id, reason: args.reason },
  });
}

export async function emitIdentityUserEmailChanged(args: {
  actor: IdentityEventActor;
  user_id: string;
  tenant_id: string;
  old_email: string;
  new_email: string;
  reason: IdentityUserEmailChanged['payload']['reason'];
}): Promise<void> {
  await emit({
    tenantId: args.tenant_id,
    aggregateType: 'identity.user',
    aggregateId: args.user_id,
    eventType: 'identity.user.email.changed',
    eventVersion: 1,
    payload: {
      actor: args.actor,
      user_id: args.user_id,
      tenant_id: args.tenant_id,
      old_email: args.old_email,
      new_email: args.new_email,
      reason: args.reason,
    },
  });
}
