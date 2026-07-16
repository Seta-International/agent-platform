import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SessionScopeProjection } from '../../../src/api/client.ts';
import { Can } from '../../../src/components/Can.tsx';
import { SessionProvider } from '../../../src/index.ts';

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
    product_access: [],
    cross_tenant_read: false,
    tenant_local_password_disabled: false,
  };
}

function renderWithSession(permissions: string[], ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider session={makeSession(permissions)}>{ui}</SessionProvider>
    </QueryClientProvider>,
  );
}

describe('Can', () => {
  it('renders children when the session has the permission', () => {
    renderWithSession(
      ['identity.user.list'],
      <Can permission="identity.user.list">
        <span>visible</span>
      </Can>,
    );
    expect(screen.getByText('visible')).toBeInTheDocument();
  });

  it('hides children when the session lacks the permission', () => {
    renderWithSession(
      [],
      <Can permission="identity.user.list">
        <span>visible</span>
      </Can>,
    );
    expect(screen.queryByText('visible')).not.toBeInTheDocument();
  });
});
