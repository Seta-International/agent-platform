import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { DensityProvider } from '../../../src/chat-experience/use-density';

function renderHeader() {
  return render(
    <DensityProvider>
      <AgentHeader />
    </DensityProvider>,
  );
}

describe('<AgentHeader> response-detail menu group', () => {
  beforeEach(() => localStorage.clear());

  it('no longer renders the old visible density radiogroup', () => {
    renderHeader();
    expect(screen.queryByRole('radiogroup', { name: /response detail/i })).toBeNull();
  });

  it('toggles density to Detailed from the actions menu', async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: 'Chat actions' }));
    expect(screen.getByRole('menuitem', { name: /concise/i })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /detailed/i }));

    // use-density persists synchronously on change.
    expect(localStorage.getItem('seta.agent.density')).toBe('detailed');
  });
});
