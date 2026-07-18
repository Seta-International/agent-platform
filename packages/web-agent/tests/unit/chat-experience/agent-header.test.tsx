import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ navigate: vi.fn(), startFreshThread: vi.fn(() => 'new-1') }));

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }));

// One saved thread so `canEdit` is true → the actions menu button is enabled.
vi.mock('../../../src/hooks/use-thread-list', () => ({
  useThreadList: () => ({
    groups: [{ label: 'Today', items: [{ id: 't1', title: 'Chat', updatedAtLabel: 'now' }] }],
  }),
}));
vi.mock('../../../src/hooks/use-thread-mutations', () => ({
  useRenameThread: () => ({ mutate: vi.fn() }),
  useDeleteThread: () => ({ mutate: vi.fn() }),
}));
vi.mock('../../../src/chat-experience/agent-provider', () => ({
  useAgentSelection: () => ({
    selection: { threadId: 't1', modelKey: 'auto' },
    actions: { startFreshThread: h.startFreshThread },
  }),
}));

import { AgentHeader } from '../../../src/chat-experience/agent-header';

describe('<AgentHeader> chat-actions menu', () => {
  it('no longer offers a Concise/Detailed response-detail toggle', async () => {
    const user = userEvent.setup();
    render(<AgentHeader />);

    await user.click(screen.getByRole('button', { name: 'Chat actions' }));
    // Rename stays; the density options and their heading are gone.
    expect(screen.getByRole('menuitem', { name: /rename/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /concise/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /detailed/i })).toBeNull();
    expect(screen.queryByText(/response detail/i)).toBeNull();
  });
});

describe('<AgentHeader>', () => {
  it('no longer renders a mobile-nav hamburger (history moved to the shell nav)', () => {
    render(<AgentHeader />);
    expect(screen.queryByRole('button', { name: /open chats/i })).toBeNull();
  });

  it('starts a fresh thread from the New chat button', () => {
    h.startFreshThread.mockClear();
    h.navigate.mockClear();
    render(<AgentHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(h.startFreshThread).toHaveBeenCalledOnce();
    expect(h.navigate).toHaveBeenCalledWith({ to: '/agent/chat', search: { thread: 'new-1' } });
  });

  it('does not render the New chat button in the compact panel header', () => {
    render(<AgentHeader compact />);
    expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull();
  });
});
