import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      selector({
        message: {
          content: [{ status: { type: 'complete' } }],
          createdAt: new Date('2026-05-20T16:13:00Z'),
        },
        thread: { isRunning: thoughtStatus === 'running' },
      }),
  };
});

vi.mock('../../../src/chat-experience/agent-provider', () => ({
  useAgentSelection: () => ({ selection: { threadId: undefined } }),
  usePageContext: () => ({ pageContext: null }),
}));

vi.mock('../../../src/workflows/components/chat-embedded-hitl', () => ({
  ChatEmbeddedHitl: () => null,
}));

vi.mock('../../../src/components/tool-renderers', () => ({
  ToolUIRegistry: () => null,
}));

vi.mock('../../../src/components/thread-list-refresher', () => ({
  ThreadListRefresher: () => null,
}));

import { AgentTranscript } from '../../../src/chat-experience/agent-transcript';
import { DensityProvider } from '../../../src/chat-experience/use-density';

// NOTE (FUT-670): `aria-expanded` is the ONLY load-bearing assertion for
// open/closed here. Astryx `Collapsible` keeps its children mounted and hides
// them with a StyleX `display: none` class; happy-dom loads no Astryx CSS, so
// `toBeVisible()` returns true for a collapsed body too — verified empirically.
// Assert presence, never visibility, for collapsed content in this suite.
describe('AgentTranscript thought group', () => {
  beforeEach(() => localStorage.clear());

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
    expect(screen.getByText('Collected reasoning')).toBeInTheDocument();
  });

  it('keeps a completed thought expanded in detailed density', () => {
    localStorage.setItem('seta.agent.density', 'detailed');
    thoughtStatus = 'complete';
    render(
      <DensityProvider>
        <AgentTranscript />
      </DensityProvider>,
    );
    expect(screen.getByRole('button', { name: /Thought/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
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
    expect(screen.getByText('Collected reasoning')).toBeInTheDocument();
  });
});
