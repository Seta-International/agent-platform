import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SessionScopeProjection } from '../../../../../src/modules/identity/api/client';
import { Can } from '../../../../../src/modules/identity/components/Can';
import { SessionProvider } from '../../../../../src/modules/identity/components/SessionProvider';

function makeSession(permissions: string[]): SessionScopeProjection {
  return {
    user_id: 'u-1',
    tenant_id: 't-1',
    tenant_name: 'Acme',
    tenant_slug: 'acme',
    email: 'ada@example.com',
    display_name: 'Ada Lovelace',
    role_summary: { roles: [], cross_tenant_read: false },
    permissions,
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
