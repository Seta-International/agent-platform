import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let thoughtStatus = 'complete';

// Drives DateDivider: each message reads its own index/createdAt and the branch
// via thread.messages. The mock renders each turn under a React context that
// pins its index, so `useAuiState` resolves the right message at React's actual
// (deferred, depth-first) render time — a plain `currentIndex` mutation would be
// stale by the time nested components like <DateDivider /> render.
let messagesFixture: { createdAt: Date }[] = [
  { createdAt: new Date('2026-05-20T16:13:00Z') },
  { createdAt: new Date('2026-05-20T16:14:00Z') },
];

const composer = vi.hoisted(() => ({ setText: vi.fn(), send: vi.fn() }));

vi.mock('@assistant-ui/react', async () => {
  const React = await import('react');
  const MessageIndexContext = React.createContext(0);

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
    Parts: ({ components }: { components: { Text: (props: unknown) => ReactNode } }) => (
      <>
        {components.Text({ text: 'Hello from the user', status: { type: 'complete' } })}
        {components.Text({
          text: 'Context:\n<<<FILE: spec.pdf>>>\nBODY\n<<<END spec.pdf>>>',
          status: { type: 'complete' },
        })}
      </>
    ),
  };

  const ThreadPrimitive = {
    Empty: ({ children }: { children: ReactNode }) => <>{children}</>,
    Messages: ({
      components,
    }: {
      components: { UserMessage: () => ReactNode; AssistantMessage: () => ReactNode };
    }) => {
      const { UserMessage, AssistantMessage } = components;
      return (
        <>
          <MessageIndexContext.Provider value={0}>
            <UserMessage />
          </MessageIndexContext.Provider>
          <MessageIndexContext.Provider value={1}>
            <AssistantMessage />
          </MessageIndexContext.Provider>
        </>
      );
    },
  };

  return {
    MessagePrimitive,
    ThreadPrimitive,
    useAui: () => ({ composer: () => composer }),
    useAuiState: (selector: (state: unknown) => unknown) => {
      const index = React.useContext(MessageIndexContext);
      return selector({
        message: {
          content: [
            { status: { type: 'complete' } },
            {
              type: 'data',
              name: 'entity-mention',
              data: { kind: 'person', id: 'w1', label: 'Jane Doe' },
            },
          ],
          createdAt: messagesFixture[index]?.createdAt ?? new Date('2026-05-20T16:13:00Z'),
          index,
        },
        thread: {
          isRunning: thoughtStatus === 'running',
          messages: messagesFixture,
        },
      });
    },
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

// Reset the day fixture so the divider tests are isolated from each other and
// from the suites that don't care about dates (they use the same-day default).
beforeEach(() => {
  messagesFixture = [
    { createdAt: new Date('2026-05-20T16:13:00Z') },
    { createdAt: new Date('2026-05-20T16:14:00Z') },
  ];
});

// Always restore real timers so a failed assertion inside a fake-timer divider
// test can't leak into the userEvent suites (fake timers + userEvent deadlock).
afterEach(() => {
  vi.useRealTimers();
});

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

// Slice F: mentions are attached at send but nothing rendered them, so they
// vanished after the turn was sent. The persisted turn carries an
// `entity-mention` data part (see the shared mock); UserMessage surfaces it as
// a visible ContextChip (muted kind + label).
describe('AgentConversation user mentions', () => {
  it('renders an @-mention from the persisted turn as a visible chip', () => {
    thoughtStatus = 'complete';
    render(<AgentConversation />);
    // Regression: mentions used to render nothing and vanish after send.
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('person')).toBeInTheDocument();
  });
});

// Slice F: a persisted attachment rides as a `Context:\n<<<FILE:` text part so
// Mastra replays it on follow-ups; PlainTextPart collapses that sentinel into a
// file ContextChip so the raw document body never reaches the user as text.
describe('AgentConversation attachment chips', () => {
  it('renders a persisted attachment filename as a chip, not raw sentinel text', () => {
    thoughtStatus = 'complete';
    render(<AgentConversation />);
    expect(screen.getByText('spec.pdf')).toBeInTheDocument();
    // The `<<<FILE:` sentinel body must never reach the user as text.
    expect(screen.queryByText(/<<<FILE:/)).toBeNull();
    expect(screen.queryByText(/BODY/)).toBeNull();
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

// Slice D: date dividers are per-message, derived from each turn's local day vs
// the previous turn's. Fixtures use the local-time Date constructor and fake
// timers pin "now" so Today/Yesterday are deterministic in any runner timezone.
describe('AgentConversation date dividers', () => {
  it('shows one divider at a day boundary and none within the same day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 18)); // local May 20 2026, 18:00
    messagesFixture = [
      { createdAt: new Date(2026, 4, 20, 9) }, // message 0 → boundary (first)
      { createdAt: new Date(2026, 4, 20, 17) }, // message 1 → same day, no divider
    ];
    thoughtStatus = 'complete';
    render(<AgentConversation />);

    // First message opens with "Today"; the same-day second message adds none.
    expect(screen.getAllByText('Today')).toHaveLength(1);
    vi.useRealTimers();
  });

  it('adds a second divider when the day changes between messages', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 21, 18)); // local May 21 2026, 18:00
    messagesFixture = [
      { createdAt: new Date(2026, 4, 20, 9) }, // Yesterday
      { createdAt: new Date(2026, 4, 21, 9) }, // Today
    ];
    thoughtStatus = 'complete';
    render(<AgentConversation />);

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    vi.useRealTimers();
  });
});

// Slice C: the empty state is a lane picker + suggestion cards. ClickableCard
// renders a visually-hidden <button aria-label={label} onClick> as its a11y
// target (verified in @astryxdesign/core), so each card is reachable by role
// "button" with its prompt as the accessible name, and clicking it fires the
// card's onClick directly. ToggleButton renders a Button (role "button", name =
// lane label). happy-dom loads no Astryx CSS, so assert presence, not visibility.
describe('AgentConversation greeting', () => {
  beforeEach(() => {
    composer.setText.mockClear();
    composer.send.mockClear();
    thoughtStatus = 'complete';
  });

  it('defaults to the General lane', () => {
    render(<AgentConversation />);
    expect(screen.getByRole('heading', { name: 'Where should we start?' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'List everything you help with' }),
    ).toBeInTheDocument();
    // A Planner-only card is not shown until its lane is selected.
    expect(
      screen.queryByRole('button', { name: 'Build a schedule from my open tasks' }),
    ).toBeNull();
  });

  it('swaps the cards when a different lane is selected', async () => {
    const user = userEvent.setup();
    render(<AgentConversation />);

    await user.click(screen.getByRole('button', { name: 'Planner' }));

    expect(
      screen.getByRole('button', { name: 'Build a schedule from my open tasks' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'List everything you help with' })).toBeNull();
  });

  it('prefills and sends the exact prompt when a card is clicked', async () => {
    const user = userEvent.setup();
    render(<AgentConversation />);

    await user.click(screen.getByRole('button', { name: 'What am I allowed to do?' }));

    expect(composer.setText).toHaveBeenCalledWith('What am I allowed to do?');
    expect(composer.send).toHaveBeenCalledTimes(1);
  });
});
