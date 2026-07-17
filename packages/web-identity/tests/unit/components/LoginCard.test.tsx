import { render, screen } from '@testing-library/react';
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

import { LoginCard } from '../../../src/components/LoginCard.tsx';

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
