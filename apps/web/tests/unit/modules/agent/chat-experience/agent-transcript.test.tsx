import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

let thoughtStatus = 'complete';

vi.mock('@assistant-ui/react', () => {
  const MessagePrimitive = {
    GroupedParts: ({ children }: { children: (props: unknown) => ReactNode }) =>
      children({
        part: {
          type: 'group-thought',
          status: { type: thoughtStatus },
          indices: [0],
        },
        children: <div>Collected reasoning</div>,
      }),
    If: () => null,
  };

  const ThreadPrimitive = {
    Empty: () => null,
    Messages: ({ components }: { components: { AssistantMessage: () => ReactNode } }) => (
      <>{components.AssistantMessage()}</>
    ),
  };

  return {
    MessagePrimitive,
    ThreadPrimitive,
    useAui: () => ({
      composer: () => ({ setText: vi.fn(), send: vi.fn() }),
    }),
    useAuiState: (selector: (state: unknown) => unknown) =>
      selector({ message: { content: [{ status: { type: 'complete' } }] } }),
  };
});

vi.mock('@/modules/agent/chat-experience/agent-provider', () => ({
  useAgentSelection: () => ({ selection: { threadId: undefined } }),
  usePageContext: () => ({ pageContext: null }),
}));

vi.mock('@/modules/agent/workflows/components/chat-embedded-hitl', () => ({
  ChatEmbeddedHitl: () => null,
}));

vi.mock('@/modules/agent/components/tool-renderers', () => ({
  ToolUIRegistry: () => null,
}));

vi.mock('@/modules/agent/components/thread-list-refresher', () => ({
  ThreadListRefresher: () => null,
}));

import { AgentTranscript } from '@/modules/agent/chat-experience/agent-transcript';

describe('AgentTranscript thought group', () => {
  it('can be expanded from the summary after the thought finishes running', async () => {
    const user = userEvent.setup();
    thoughtStatus = 'running';
    const { rerender } = render(<AgentTranscript />);

    expect(screen.getByRole('button', { name: /Thinking/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    thoughtStatus = 'complete';
    rerender(<AgentTranscript />);

    expect(screen.getByRole('button', { name: /Thought/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await user.click(screen.getByText(/Thought/));

    expect(screen.getByRole('button', { name: /Thought/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Collected reasoning')).toBeVisible();
  });

  it('opens a completed thought when the user clicks the thought card', async () => {
    const user = userEvent.setup();
    thoughtStatus = 'complete';
    render(<AgentTranscript />);

    const thought = screen.getByRole('button', { name: /Thought/ });
    expect(thought).toHaveAttribute('aria-expanded', 'false');

    await user.click(thought);

    expect(screen.getByRole('button', { name: /Thought/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Collected reasoning')).toBeVisible();
  });
});
