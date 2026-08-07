import { render, screen, waitFor, within } from '@testing-library/react';
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
// Returns the render result so alert assertions can scope to the card: Astryx
// announces through a singleton live region appended to document.body, and the
// assertive one carries role="alert" just like the Banner and field status do.
async function goToPasswordStep(user: UserEvent, email: string) {
  mockedDiscoverProvider.mockResolvedValueOnce({ provider_id: 'credential' });
  const view = render(<LoginCard />);
  await user.type(screen.getByLabelText(/work email/i), email);
  await user.click(screen.getByRole('button', { name: /continue/i }));
  await screen.findByRole('heading', { level: 1, name: /enter your password/i });
  return view;
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

  // The idle branch is deleted. core's session middleware still emits
  // /login?reason=idle (middleware/session.ts:55), but apps/server serves no
  // non-/api/ paths, so it cannot reach a browser. Removing that emitter is FUT-723.
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

  it('disables Continue and sets aria-busy while onContinue is in flight', async () => {
    const user = userEvent.setup();
    render(<LoginCard />);
    let resolveDiscover: (value: { provider_id: string }) => void = () => {};
    mockedDiscoverProvider.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDiscover = resolve;
      }),
    );
    await user.type(screen.getByLabelText(/work email/i), 'person@company.com');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    // Astryx's isLoading keeps the accessible name stable ("Continue") and
    // signals in-flight state via aria-busy + disabled, not a swapped label.
    const button = screen.getByRole('button', { name: /continue/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    resolveDiscover({ provider_id: 'credential' });
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
    // Astryx's isLoading keeps the accessible name stable ("Sign in") and
    // signals in-flight state via aria-busy + disabled, not a swapped label.
    const button = screen.getByRole('button', { name: /^sign in$/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
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

  // Change 4: a credential mismatch is a "you typed this field wrong" error,
  // so it renders inline on the password field via TextInput's status prop
  // (real aria-describedby wiring) instead of a page-level Banner.
  it('renders a credential mismatch error inline on the password field, with the message text unchanged', async () => {
    const user = userEvent.setup();
    await goToPasswordStep(user, 'person@company.com');
    mockedSignInEmail.mockResolvedValueOnce({ error: { status: 401 } });
    await user.type(screen.getByLabelText(/^password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    const message = "That email and password don't match. Try again.";
    await screen.findByText(message);

    // Genuinely field-level: the password input's aria-describedby resolves
    // to a node that contains the error text (Field.tsx's real wiring), not
    // just co-located text on the page.
    const passwordInput = screen.getByLabelText(/^password/i);
    const describedByIds = passwordInput.getAttribute('aria-describedby')?.split(' ') ?? [];
    const status = describedByIds
      .map((id) => document.getElementById(id))
      .find((el) => el?.textContent?.includes(message));
    expect(status).toBeDefined();

    // A credential mismatch alone must not disable the button (only rate
    // limiting does), and it must render as the field's own status (Astryx
    // `astryx-field-status`), not as a page-level Banner (`astryx-banner`).
    // The status node itself is no longer role="alert" — Astryx announces
    // through its body-level live region instead — so assert on the node the
    // input actually describes.
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled();
    expect(status?.className).toMatch(/astryx-field-status/);
    expect(document.querySelector('.astryx-banner')).toBeNull();
  });

  // Change 4: rate limiting is form-level (not "you typed this wrong"), so it
  // must keep rendering as a Banner and must keep disabling Sign in.
  it('still renders a rate-limit error as a Banner and keeps Sign in disabled', async () => {
    const user = userEvent.setup();
    const { container } = await goToPasswordStep(user, 'person@company.com');
    mockedSignInEmail.mockResolvedValueOnce({ error: { status: 429 } });
    await user.type(screen.getByLabelText(/^password/i), 'hunter2');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    const message = 'Too many attempts. Wait a minute, then try again.';
    const banner = await within(container).findByRole('alert');
    expect(banner).toHaveTextContent(message);

    // Not wired to the field: rate limiting is not a per-field status, so the
    // password input carries no aria-describedby link to it.
    expect(screen.getByLabelText(/^password/i)).not.toHaveAttribute('aria-describedby');

    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDisabled();
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

  // Astryx blanks loading-state button content via `color: transparent`, which only
  // affects currentColor. MicrosoftLogo paints literal vendor hex `fill`s, so it would
  // survive that and sit under the spinner. The icon must be dropped outright instead.
  it('removes the Microsoft logo while the sign-in is in flight', async () => {
    const user = userEvent.setup();
    await goToSsoStep(user, 'person@company.com');

    // The logo's own vendor red — nothing else on the screen paints it.
    const logo = () => document.querySelector('rect[fill="#f25022"]');
    expect(logo()).not.toBeNull();

    let resolveSocial: (value: { error?: { message?: string } }) => void = () => {};
    mockedSignInSocial.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSocial = resolve;
      }),
    );
    await user.click(screen.getByRole('button', { name: /continue with microsoft/i }));

    const button = screen.getByRole('button', { name: /continue with microsoft/i });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(logo()).toBeNull();

    resolveSocial({});
    // The logo comes back once the request settles.
    await waitFor(() => expect(logo()).not.toBeNull());
  });
});
