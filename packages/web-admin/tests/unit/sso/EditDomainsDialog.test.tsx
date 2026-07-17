import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditDomainsDialog } from '../../../src/sso/components/EditDomainsDialog.tsx';

const registerProviderMock = vi.fn(async () => ({}));

vi.mock('../../../src/sso/api/sso-client.ts', () => ({
  registerProvider: (body: unknown) => registerProviderMock(body),
}));

// EditDomainsDialog is self-triggering: the "Edit domains" Button is now a plain sibling of
// Astryx's `Dialog` (no more DialogTrigger). purpose="form" → role="dialog". Dialog always
// mounts regardless of `isOpen`, so "closed" is asserted via the role leaving the a11y tree.
describe('EditDomainsDialog', () => {
  beforeEach(() => {
    registerProviderMock.mockClear();
  });

  it('is not exposed as a dialog until "Edit domains" is clicked', () => {
    render(
      <EditDomainsDialog entraTenantId={null} initialDomains={['acme.com']} onSaved={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with heading "Edit email domains", adds a domain, and saves', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <EditDomainsDialog
        entraTenantId="tenant-1"
        initialDomains={['acme.com']}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit domains' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit email domains' })).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Email domains'), 'new-domain.com');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(registerProviderMock).toHaveBeenCalledWith({
        email_domains: ['acme.com', 'new-domain.com'],
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    // Save succeeds → dialog closes.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a validation error and does not save with zero domains', async () => {
    const user = userEvent.setup();
    render(<EditDomainsDialog entraTenantId={null} initialDomains={[]} onSaved={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Edit domains' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Add at least one email domain.')).toBeInTheDocument();
    expect(registerProviderMock).not.toHaveBeenCalled();
  });

  it('closes via Cancel without saving', async () => {
    const user = userEvent.setup();
    render(
      <EditDomainsDialog entraTenantId={null} initialDomains={['acme.com']} onSaved={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit domains' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(registerProviderMock).not.toHaveBeenCalled();
  });
});
