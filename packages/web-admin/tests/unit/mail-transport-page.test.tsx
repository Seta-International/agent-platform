import type { SessionScopeProjection } from '@seta/web-identity';
import { SessionProvider } from '@seta/web-identity';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MailTransport } from '../../src/mail-transport/pages/MailTransport.tsx';

vi.mock('../../src/mail-transport/api/mail-transport-client.ts', () => ({
  getMailTransport: async () => null,
  setMailTransport: vi.fn(),
  disableMailTransport: vi.fn(),
  verifyMailTransport: vi.fn(),
}));

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

function renderPage(permissions: string[]) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SessionProvider session={makeSession(permissions)}>
        <MailTransport />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe('MailTransport page (FUT-4 permission gating)', () => {
  it('enables the form when the session has integrations.mail.configure', async () => {
    renderPage(['integrations.mail.configure']);
    const senderAddress = await screen.findByLabelText('Sender address');
    expect(senderAddress).not.toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable' })).not.toBeDisabled());
  });

  it('disables the form when the session lacks integrations.mail.configure', async () => {
    renderPage([]);
    const senderAddress = await screen.findByLabelText('Sender address');
    expect(senderAddress).toBeDisabled();
    expect(screen.getByLabelText('Sender display name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enable' })).toBeDisabled();
    expect(screen.getByLabelText('Recipient email')).toBeDisabled();
  });
});
