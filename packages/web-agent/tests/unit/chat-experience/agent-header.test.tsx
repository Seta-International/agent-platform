import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  startFreshThread: vi.fn(() => 'new-1'),
  renameChat: vi.fn(),
  deleteChat: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }));

// One saved thread so `canEdit` is true → the actions menu button is enabled.
vi.mock('../../../src/hooks/use-thread-list', () => ({
  useThreadList: () => ({
    groups: [{ label: 'Today', items: [{ id: 't1', title: 'Chat', updatedAtLabel: 'now' }] }],
  }),
}));
vi.mock('../../../src/chat-experience/agent-provider', () => ({
  useAgentSelection: () => ({
    selection: { threadId: 't1', modelKey: 'auto' },
    actions: { startFreshThread: h.startFreshThread },
  }),
}));
// Rename/delete are routed through the shared chat modals.
vi.mock('../../../src/chat-experience/chat-actions', () => ({
  useChatActions: () => ({ renameChat: h.renameChat, deleteChat: h.deleteChat }),
}));

import { AgentHeader } from '../../../src/chat-experience/agent-header';

describe('<AgentHeader> chat-actions menu', () => {
  it('offers Rename/Delete and no Concise/Detailed toggle', async () => {
    const user = userEvent.setup();
    render(<AgentHeader />);

    await user.click(screen.getByRole('button', { name: 'Chat actions' }));
    expect(screen.getByRole('menuitem', { name: /rename/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete chat/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /concise/i })).toBeNull();
    expect(screen.queryByText(/response detail/i)).toBeNull();
  });

  it('deletes through the shared confirm modal', async () => {
    const user = userEvent.setup();
    h.deleteChat.mockClear();
    render(<AgentHeader />);
    await user.click(screen.getByRole('button', { name: 'Chat actions' }));
    await user.click(screen.getByRole('menuitem', { name: /delete chat/i }));
    expect(h.deleteChat).toHaveBeenCalledWith('t1');
  });
});

describe('<AgentHeader>', () => {
  it('opens the rename modal from the Rename menu item', async () => {
    const user = userEvent.setup();
    h.renameChat.mockClear();
    render(<AgentHeader />);
    await user.click(screen.getByRole('button', { name: 'Chat actions' }));
    await user.click(screen.getByRole('menuitem', { name: /rename/i }));
    expect(h.renameChat).toHaveBeenCalledWith('t1', 'Chat');
  });

  it('starts a fresh thread from the New chat button', () => {
    h.startFreshThread.mockClear();
    h.navigate.mockClear();
    render(<AgentHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(h.startFreshThread).toHaveBeenCalledOnce();
    expect(h.navigate).toHaveBeenCalledWith({ to: '/agent/chat', search: { thread: 'new-1' } });
  });

  it('renders the New chat button in the compact panel header too', () => {
    render(<AgentHeader compact />);
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument();
  });
});
