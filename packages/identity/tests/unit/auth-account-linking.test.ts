import { describe, expect, it } from 'vitest';
import { auth } from '../../src/backend/auth.ts';

describe('better-auth account linking config', () => {
  it('does not require local email verification before linking a trusted SSO provider', () => {
    // A person provisioned by M365 directory sync (packages/identity/src/backend/domain/provision-login.ts)
    // gets an identity.user shell with email_verified=false — there is no local email-click
    // verification step for SSO-only accounts. better-auth's own account-linking gate
    // (oauth2/link-account.mjs) rejects linking a new trusted-provider account to such a user
    // with "account not linked" unless requireLocalEmailVerified is explicitly disabled, since
    // it otherwise defaults to true. Microsoft's own OIDC verification already establishes
    // ownership of the email for a trusted provider, so requiring local verification on top of
    // that blocks every first-time SSO login for directory-synced people (FUT-943).
    expect(auth.options.account?.accountLinking?.requireLocalEmailVerified).toBe(false);
  });
});
