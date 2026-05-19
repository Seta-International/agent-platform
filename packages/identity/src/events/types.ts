export type Uuid = string;

export interface IdentityEventActor {
  type: 'user' | 'cli' | 'superadmin';
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

export type IdentityEvent =
  | IdentityUserCreated
  | IdentityUserProfileUpdated
  | IdentityUserDeactivated
  | IdentityRoleGrantChanged;
