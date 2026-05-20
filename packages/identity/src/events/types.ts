export type Uuid = string;

export interface IdentityEventActor {
  type: 'user' | 'cli' | 'superadmin' | 'sso';
  user_id: Uuid | null;
  ip?: string;
  user_agent?: string;
}

export interface IdentityUserCreated {
  event_type: 'identity.user.created';
  event_version: 1;
  aggregate_type: 'identity.user';
  aggregate_id: Uuid;
  payload: {
    actor: IdentityEventActor;
    after: {
      user_id: Uuid;
      tenant_id: Uuid;
      email: string;
      name: string;
      created_via: 'admin' | 'cli' | 'sso';
      sso_provider_id?: string;
    };
  };
}

export interface IdentityUserProfileUpdated {
  event_type: 'identity.user.profile.updated';
  event_version: 1;
  aggregate_type: 'identity.user';
  aggregate_id: Uuid;
  payload: {
    actor: IdentityEventActor;
    user_id: Uuid;
    before: Partial<{
      display_name: string;
      availability_status: string;
      ooo_until: string | null;
      timezone: string;
      skills: string[];
    }>;
    after: Partial<{
      display_name: string;
      availability_status: string;
      ooo_until: string | null;
      timezone: string;
      skills: string[];
    }>;
  };
}

export interface IdentityUserDeactivated {
  event_type: 'identity.user.deactivated';
  event_version: 1;
  aggregate_type: 'identity.user';
  aggregate_id: Uuid;
  payload: {
    actor: IdentityEventActor;
    user_id: Uuid;
    tenant_id: Uuid;
    deactivated_at: string;
  };
}

export interface IdentityRoleGrantChanged {
  event_type: 'identity.role_grant.changed';
  event_version: 1;
  aggregate_type: 'identity.user';
  aggregate_id: Uuid;
  payload: {
    actor: IdentityEventActor;
    user_id: Uuid;
    tenant_id: Uuid;
    change: 'granted' | 'revoked';
    grant: {
      grant_id: Uuid;
      role_slug: string;
      scope_type: 'tenant' | 'group';
      scope_id: string | null;
      granted_via: 'admin' | 'cli' | 'idp';
    };
  };
}

export interface IdentitySsoProviderRegistered {
  event_type: 'identity.sso_provider.registered';
  event_version: 1;
  aggregate_type: 'identity.sso_provider';
  aggregate_id: string;
  payload: {
    actor: IdentityEventActor;
    after: {
      tenant_id: string;
      provider_id: 'microsoft-entra-id';
      entra_tenant_id: string;
      email_domains: string[];
    };
  };
}

export interface IdentitySsoProviderConsentGranted {
  event_type: 'identity.sso_provider.consent_granted';
  event_version: 1;
  aggregate_type: 'identity.sso_provider';
  aggregate_id: string;
  payload: {
    actor: IdentityEventActor;
    tenant_id: string;
    provider_id: 'microsoft-entra-id';
    granted_by_oid: string | null;
    granted_by_email: string | null;
  };
}

export interface IdentitySsoProviderEnabled {
  event_type: 'identity.sso_provider.enabled';
  event_version: 1;
  aggregate_type: 'identity.sso_provider';
  aggregate_id: string;
  payload: { actor: IdentityEventActor; tenant_id: string; provider_id: 'microsoft-entra-id' };
}

export interface IdentitySsoProviderDisabled {
  event_type: 'identity.sso_provider.disabled';
  event_version: 1;
  aggregate_type: 'identity.sso_provider';
  aggregate_id: string;
  payload: { actor: IdentityEventActor; tenant_id: string; provider_id: 'microsoft-entra-id' };
}

export interface IdentitySsoProviderDisconnected {
  event_type: 'identity.sso_provider.disconnected';
  event_version: 1;
  aggregate_type: 'identity.sso_provider';
  aggregate_id: string;
  payload: { actor: IdentityEventActor; tenant_id: string; provider_id: 'microsoft-entra-id' };
}

export interface IdentityUserSsoLinked {
  event_type: 'identity.user.sso_linked';
  event_version: 1;
  aggregate_type: 'identity.user';
  aggregate_id: Uuid;
  payload: {
    actor: IdentityEventActor;
    user_id: Uuid;
    tenant_id: Uuid;
    provider_id: 'microsoft-entra-id';
    entra_oid: string;
    entra_tid: string;
  };
}

export interface IdentityUserSsoRevoked {
  event_type: 'identity.user.sso_revoked';
  event_version: 1;
  aggregate_type: 'identity.user';
  aggregate_id: Uuid;
  payload: {
    actor: IdentityEventActor;
    user_id: Uuid;
    reason: 'entra_returned_access_denied' | 'tid_mismatch' | 'user_deactivated' | 'oid_conflict';
  };
}

export interface IdentityUserEmailChanged {
  event_type: 'identity.user.email.changed';
  event_version: 1;
  aggregate_type: 'identity.user';
  aggregate_id: Uuid;
  payload: {
    actor: IdentityEventActor;
    user_id: Uuid;
    tenant_id: Uuid;
    old_email: string;
    new_email: string;
    reason: 'admin' | 'sso_sync';
  };
}

export interface IdentityUserPasswordResetByAdmin {
  event_type: 'identity.user.password_reset.by_admin';
  event_version: 1;
  aggregate_type: 'identity.user';
  aggregate_id: Uuid;
  payload: {
    actor: IdentityEventActor;
    user_id: Uuid;
    tenant_id: Uuid;
  };
}

export interface IdentitySessionRevoked {
  event_type: 'identity.session.revoked';
  event_version: 1;
  aggregate_type: 'identity.user';
  aggregate_id: Uuid;
  payload: {
    actor: IdentityEventActor;
    user_id: Uuid;
    tenant_id: Uuid;
    session_id: Uuid;
  };
}

export type IdentityEvent =
  | IdentityUserCreated
  | IdentityUserProfileUpdated
  | IdentityUserDeactivated
  | IdentityRoleGrantChanged
  | IdentitySsoProviderRegistered
  | IdentitySsoProviderConsentGranted
  | IdentitySsoProviderEnabled
  | IdentitySsoProviderDisabled
  | IdentitySsoProviderDisconnected
  | IdentityUserSsoLinked
  | IdentityUserSsoRevoked
  | IdentityUserEmailChanged
  | IdentityUserPasswordResetByAdmin
  | IdentitySessionRevoked;
