import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

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
    actions: { startFreshThread: vi.fn() },
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
});
