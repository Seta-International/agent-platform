import type { IdentityEvent } from '@seta/identity';
import { ACTIVITY_SUBJECT_PATHS } from '@seta/identity/internal/activity-subject-paths';
import { describe, expect, it } from 'vitest';

// Enumerate every identity.* event_type from the discriminated union.
// Adding a new event type without a subject-path entry must fail the build.
type Identity = IdentityEvent['event_type'];
const ALL_TYPES: ReadonlyArray<Identity> = [
  'identity.user.created',
  'identity.user.profile.updated',
  'identity.user.deactivated',
  'identity.role_grant.changed',
  'identity.sso_provider.registered',
  'identity.sso_provider.consent_granted',
  'identity.sso_provider.enabled',
  'identity.sso_provider.disabled',
  'identity.sso_provider.disconnected',
  'identity.user.sso_linked',
  'identity.user.sso_revoked',
  'identity.user.email.changed',
  'identity.user.password_reset.by_admin',
  'identity.session.revoked',
];

describe('ACTIVITY_SUBJECT_PATHS coverage', () => {
  it('covers every identity.* event_type known to the union', () => {
    for (const t of ALL_TYPES) {
      expect(t in ACTIVITY_SUBJECT_PATHS, `missing subject path for ${t}`).toBe(true);
    }
  });

  it('keys are an exact superset of the typed union (no orphan entries)', () => {
    const all = new Set<string>(ALL_TYPES);
    for (const k of Object.keys(ACTIVITY_SUBJECT_PATHS)) {
      expect(all.has(k), `orphan entry for ${k}`).toBe(true);
    }
  });
});
