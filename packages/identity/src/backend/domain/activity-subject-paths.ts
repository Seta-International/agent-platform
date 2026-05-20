import type { IdentityEvent } from '../../events/types.ts';

type EventType = IdentityEvent['event_type'];

// Each entry is a Postgres JSONB path expression that pulls the affected user id
// from the event payload. `null` means the event has no user subject.
export const ACTIVITY_SUBJECT_PATHS: Record<EventType, string | null> = {
  'identity.user.created': "payload->'after'->>'user_id'",
  'identity.user.profile.updated': "payload->>'user_id'",
  'identity.user.deactivated': "payload->>'user_id'",
  'identity.role_grant.changed': "payload->>'user_id'",
  'identity.sso_provider.registered': null,
  'identity.sso_provider.consent_granted': null,
  'identity.sso_provider.enabled': null,
  'identity.sso_provider.disabled': null,
  'identity.sso_provider.disconnected': null,
  'identity.user.sso_linked': "payload->>'user_id'",
  'identity.user.sso_revoked': "payload->>'user_id'",
  'identity.user.email.changed': "payload->>'user_id'",
  'identity.user.password_reset.by_admin': "payload->>'user_id'",
  'identity.session.revoked': "payload->>'user_id'",
};
