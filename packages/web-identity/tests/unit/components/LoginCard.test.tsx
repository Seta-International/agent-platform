import { render, screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSearch = vi.hoisted(() => ({ current: {} as Record<string, string | undefined> }));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => mockSearch.current,
}));

vi.mock('../../../src/api/client.ts', () => ({
  discoverProvider: vi.fn(),
}));

vi.mock('../../../src/auth-client.ts', () => ({
  signIn: { email: vi.fn(), social: vi.fn() },
}));

import { discoverProvider } from '../../../src/api/client.ts';
import { signIn } from '../../../src/auth-client.ts';
import { LoginCard } from '../../../src/components/LoginCard.tsx';

const mockedDiscoverProvider = vi.mocked(discoverProvider);
const mockedSignInEmail = vi.mocked(signIn.email);
const mockedSignInSocial = vi.mocked(signIn.social);

// Drives the email step to submission and waits for the next step's heading to
// land, so tests exercise the real discover → step-dispatch flow rather than
// rendering PasswordStep/SsoStep in isolation.
async function goToPasswordStep(user: UserEvent, email: string) {
  mockedDiscoverProvider.mockResolvedValueOnce({ provider_id: 'credential' });
  render(<LoginCard />);
  await user.type(screen.getByLabelText(/work email/i), email);
  await user.click(screen.getByRole('button', { name: /continue/i }));
  await screen.findByRole('heading', { level: 1, name: /enter your password/i });
}

async function goToSsoStep(user: UserEvent, email: string) {
  mockedDiscoverProvider.mockResolvedValueOnce({ provider_id: 'microsoft' });
  render(<LoginCard />);
  await user.type(screen.getByLabelText(/work email/i), email);
  await user.click(screen.getByRole('button', { name: /continue/i }));
  await screen.findByRole('heading', { level: 1, name: /sign in with microsoft/i });
}

describe('LoginCard search params', () => {
  beforeEach(() => {
    mockSearch.current = {};
  });

  it('surfaces a mapped SSO error from the callback', () => {
    mockSearch.current = { error: 'tid_mismatch' };
    render(<LoginCard />);
    expect(screen.getByText(/belongs to a different organization/i)).toBeInTheDocument();
  });

  it('falls back to a generic message for an unknown error code', () => {
    mockSearch.current = { error: 'something_new' };
    render(<LoginCard />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('shows no error banner when there is no error param', () => {
    render(<LoginCard />);
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  // The idle branch is being deleted: nothing in the repo ever sets reason=idle.
  it('does not render inactivity copy for reason=idle', () => {
    mockSearch.current = { reason: 'idle' };
    render(<LoginCard />);
    expect(screen.queryByText(/inactivity/i)).not.toBeInTheDocument();
  });
});

describe('LoginCard email step', () => {
  beforeEach(() => {
    mockSearch.current = {};
  });

  it('renders the sign-in heading', () => {
    render(<LoginCard />);
    expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
  });

  it('disables Continue until an email is entered', async () => {
    const user = userEvent.setup();
    render(<LoginCard />);
    const button = screen.getByRole('button', { name: /continue/i });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/work email/i), 'a@b.com');
    expect(button).toBeEnabled();
  });

  it('does not render an inline system-status claim', () => {
    render(<LoginCard />);
    expect(screen.queryByText(/all systems operational/i)).not.toBeInTheDocument();
  });
});

describe('LoginCard password step', () => {
  beforeEach(() => {
    mockSearch.current = {};
    mockedDiscoverProvider.mockReset();
    mockedSignInEmail.mockReset();
  });

  // Regression test for the dead `description` prop: Token never renders it, so
  // the eyebrow above the email token was invisible both on screen and to
  // assistive tech. This must fail against the pre-fix markup.
  it('shows a visible "Signing in as" eyebrow above the email token', async () => {
    const user = userEvent.setup();
    await goToPasswordStep(user, 'person@company.com');
    expect(screen.getByText(/signing in as/i)).toBeInTheDocument();
  });

  it('returns to the email step when the token remove control is used', async () => {
    const user = userEvent.setup();
    await goToPasswordStep(user, 'person@company.com');
    await user.click(screen.getByRole('button', { name: 'Remove person@company.com' }));
    expect(screen.getByRole('heading', { level: 1, name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
  });

  it('renders "Start over" as a real button, and resets to the email step', async () => {
    const user = userEvent.setup();
    await goToPasswordStep(user, 'person@company.com');
    const startOver = screen.getByRole('button', { name: /start over/i });
    expect(startOver.tagName).toBe('BUTTON');
    await user.click(startOver);
    expect(screen.getByRole('heading', { level: 1, name: /^sign in$/i })).toBeInTheDocument();
  });

  it('renders the Reset control as a mailto: anchor', async () => {
    const user = userEvent.setup();
    await goToPasswordStep(user, 'person@company.com');
    const reset = screen.getByRole('link', { name: /reset/i });
    expect(reset.tagName).toBe('A');
    expect(reset).toHaveAttribute('href', expect.stringMatching(/^mailto:/));
  });

  it('disables Sign in while the request is in flight', async () => {
    const user = userEvent.setup();
    await goToPasswordStep(user, 'person@company.com');
    let resolveSignIn: (value: { error?: { status: number; message?: string } }) => void = () => {};
    mockedSignInEmail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }),
    );
    await user.type(screen.getByLabelText(/^password/i), 'hunter2');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    resolveSignIn({});
  });

  it('disables Sign in once rate limited', async () => {
    const user = userEvent.setup();
    await goToPasswordStep(user, 'person@company.com');
    mockedSignInEmail.mockResolvedValueOnce({ error: { status: 429 } });
    await user.type(screen.getByLabelText(/^password/i), 'hunter2');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeDisabled();
  });
});

describe('LoginCard SSO step', () => {
  beforeEach(() => {
    mockSearch.current = {};
    mockedDiscoverProvider.mockReset();
    mockedSignInSocial.mockReset();
  });

  it('shows a visible "Signing in as" eyebrow above the email token', async () => {
    const user = userEvent.setup();
    await goToSsoStep(user, 'person@company.com');
    expect(screen.getByText(/signing in as/i)).toBeInTheDocument();
  });

  it('calls signIn.social with the microsoft provider', async () => {
    const user = userEvent.setup();
    await goToSsoStep(user, 'person@company.com');
    await user.click(screen.getByRole('button', { name: /continue with microsoft/i }));
    expect(mockedSignInSocial).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'microsoft' }),
    );
  });
});
