import { render, screen, within } from '@testing-library/react';
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
    Parts: ({ components }: { components: { Text: (props: unknown) => ReactNode } }) =>
      components.Text({ text: 'Hello from the user', status: { type: 'complete' } }),
  };

  const ThreadPrimitive = {
    Empty: () => null,
    Messages: ({
      components,
    }: {
      components: { UserMessage: () => ReactNode; AssistantMessage: () => ReactNode };
    }) => (
      <>
        {components.UserMessage()}
        {components.AssistantMessage()}
      </>
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

// The conversation now owns the composer via ChatLayout's dock; the composer
// pulls in providers this suite deliberately does not mount, so it's stubbed
// with a renderable marker (not `null`) — a `null` stub would make the dock
// adoption itself unverifiable (see the "renders composer in the dock" test).
vi.mock('../../../src/chat-experience/agent-composer', () => ({
  AgentComposer: () => <div data-testid="composer-stub" />,
}));

import { AgentConversation } from '../../../src/chat-experience/agent-conversation';
import { DensityProvider } from '../../../src/chat-experience/use-density';

// NOTE (FUT-670): `aria-expanded` is the ONLY load-bearing assertion for
// open/closed here. Astryx `Collapsible` keeps its children mounted and hides
// them with a StyleX `display: none` class; happy-dom loads no Astryx CSS, so
// `toBeVisible()` returns true for a collapsed body too — verified empirically.
// Assert presence, never visibility, for collapsed content in this suite.
describe('AgentConversation thought group', () => {
  beforeEach(() => localStorage.clear());

  it('can be expanded from the summary after the thought finishes running', async () => {
    const user = userEvent.setup();
    thoughtStatus = 'running';
    const { rerender } = render(<AgentConversation />);

    expect(screen.getByRole('button', { name: /Thinking/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    thoughtStatus = 'complete';
    rerender(<AgentConversation />);

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
        <AgentConversation />
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
    render(<AgentConversation />);

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

// Regression for FUT-670 review finding: the migration wrapped assistant text
// in a `ghost` ChatMessageBubble but left the user path with no bubble at
// all, so user turns rendered as unstyled full-width text. Assert the bubble
// is structurally present rather than trying to assert appearance — happy-dom
// loads no Astryx CSS, so nothing about background/padding/max-width is
// observable here (see the note atop this file re: `toBeVisible()`).
describe('AgentConversation user message', () => {
  it('wraps the user turn in a filled ChatMessageBubble', () => {
    thoughtStatus = 'complete';
    const { container } = render(<AgentConversation />);

    expect(screen.getByText('Hello from the user')).toBeInTheDocument();
    // ChatMessageBubble reflects its variant/sender as data attributes
    // (see @astryxdesign/core's themeProps); `data-variant` only exists on
    // the bubble itself, not the outer ChatMessage wrapper, so this selector
    // is specific to the bubble being present with the default 'filled'
    // variant (the old composite's user bubble was solid, not ghost).
    expect(container.querySelector('[data-sender="user"][data-variant="filled"]')).not.toBeNull();
  });
});

// Regression for FUT-670 Task 5 review finding: nothing in this suite asserted
// the headline change — that ChatLayout's `composer` slot is actually wired to
// `<AgentComposer />` rather than left `composer={null}`. Reverting that one
// prop would leave a silent regression (the composer vanishes) while every
// other test in this file kept passing, because they all stub AgentComposer.
// Mutation-tested: reverting `composer={<AgentComposer />}` to
// `composer={null}` in agent-conversation.tsx makes this test fail (the
// composer stub is absent) while leaving the rest of the suite green.
describe('AgentConversation composer dock', () => {
  it('renders the composer in the dock, not inside the transcript log', () => {
    thoughtStatus = 'complete';
    render(<AgentConversation />);

    const composer = screen.getByTestId('composer-stub');
    expect(composer).toBeInTheDocument();
    expect(within(screen.getByRole('log')).queryByTestId('composer-stub')).toBeNull();
  });
});
