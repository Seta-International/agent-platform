import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SessionScopeProjection } from '../../../src/api/client.ts';
import { Can, Feature } from '../../../src/components/Can.tsx';
import { SessionProvider } from '../../../src/index.ts';

function makeSession(permissions: string[], features: string[] = []): SessionScopeProjection {
  return {
    user_id: 'u-1',
    tenant_id: 't-1',
    tenant_name: 'Acme',
    tenant_slug: 'acme',
    email: 'ada@example.com',
    display_name: 'Ada Lovelace',
    role_summary: { roles: [], cross_tenant_read: false },
    permissions,
    features,
    accessible_group_ids: [],
    cross_tenant_read: false,
    tenant_local_password_disabled: false,
  };
}

describe('Can', () => {
  it('renders children when the session has the permission', () => {
    render(
      <SessionProvider session={makeSession(['identity.user.read.any'])}>
        <Can permission="identity.user.read.any">
          <span>visible</span>
        </Can>
      </SessionProvider>,
    );
    expect(screen.getByText('visible')).toBeInTheDocument();
  });

  it('hides children when the session lacks the permission', () => {
    render(
      <SessionProvider session={makeSession([])}>
        <Can permission="identity.user.read.any">
          <span>visible</span>
        </Can>
      </SessionProvider>,
    );
    expect(screen.queryByText('visible')).not.toBeInTheDocument();
  });
});

describe('Feature', () => {
  it('renders children when the session has the feature', () => {
    render(
      <SessionProvider session={makeSession([], ['hiring'])}>
        <Feature feature="hiring">
          <span>enabled</span>
        </Feature>
      </SessionProvider>,
    );
    expect(screen.getByText('enabled')).toBeInTheDocument();
  });

  it('hides children when the session lacks the feature', () => {
    render(
      <SessionProvider session={makeSession([], [])}>
        <Feature feature="hiring">
          <span>enabled</span>
        </Feature>
      </SessionProvider>,
    );
    expect(screen.queryByText('enabled')).not.toBeInTheDocument();
  });
});
