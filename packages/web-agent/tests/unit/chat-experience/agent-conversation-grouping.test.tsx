import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bubbleCalls: { variant?: string; group?: string }[] = [];

vi.mock('@seta/shared-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@seta/shared-ui')>();
  return {
    ...actual,
    ChatMessageBubble: ({
      children,
      variant,
      group,
    }: {
      children: ReactNode;
      variant?: string;
      group?: string;
    }) => {
      bubbleCalls.push({ variant, group });
      return <div data-variant={variant}>{children}</div>;
    },
  };
});

// A text part with two <think> blocks → three adjacent ghost text bubbles.
const THREE_SEGMENT_TEXT = 'one<think>a</think>two<think>b</think>three';

vi.mock('@assistant-ui/react', () => {
  const MessagePrimitive = {
    GroupedParts: ({ children }: { children: (props: unknown) => ReactNode }) =>
      children({
        part: { type: 'text', text: THREE_SEGMENT_TEXT, status: { type: 'complete' } },
        children: null,
      }),
    If: () => null,
    Parts: () => null,
  };
  const ThreadPrimitive = {
    Empty: () => null,
    Messages: ({ components }: { components: { AssistantMessage: () => ReactNode } }) => {
      const { AssistantMessage } = components;
      return <AssistantMessage />;
    },
  };
  return {
    MessagePrimitive,
    ThreadPrimitive,
    useAui: () => ({ composer: () => ({ setText: vi.fn(), send: vi.fn() }) }),
    useAuiState: (selector: (s: unknown) => unknown) =>
      selector({
        message: { content: [], createdAt: new Date('2026-05-20T16:13:00Z'), index: 0 },
        thread: { isRunning: false, messages: [{ createdAt: new Date('2026-05-20T16:13:00Z') }] },
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
vi.mock('../../../src/components/tool-renderers', () => ({ ToolUIRegistry: () => null }));
vi.mock('../../../src/components/thread-list-refresher', () => ({
  ThreadListRefresher: () => null,
}));
vi.mock('../../../src/chat-experience/agent-composer', () => ({
  AgentComposer: () => <div data-testid="composer-stub" />,
}));

import { AgentConversation } from '../../../src/chat-experience/agent-conversation';

describe('AgentConversation multi-bubble grouping', () => {
  beforeEach(() => {
    bubbleCalls.length = 0;
    localStorage.clear();
  });

  it('groups a turn’s adjacent ghost text bubbles first → middle → last', () => {
    render(<AgentConversation />);
    const ghostGroups = bubbleCalls.filter((c) => c.variant === 'ghost').map((c) => c.group);
    expect(ghostGroups).toEqual(['first', 'middle', 'last']);
  });
});
