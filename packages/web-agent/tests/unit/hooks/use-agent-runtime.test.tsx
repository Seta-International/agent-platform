import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Capture the `toCreateMessage` override the runtime hands to useChatRuntime.
// That override is where page-context and mention parts are attached, and it is
// not otherwise reachable from outside the hook.
let captured: ((m: { role: string; content: readonly unknown[] }) => unknown) | null = null;

vi.mock('@assistant-ui/react', () => ({
  // Invoke the runtimeHook so useChatRuntime (and our capture) actually runs.
  useRemoteThreadListRuntime: (opts: { runtimeHook: () => unknown }) => opts.runtimeHook(),
}));

vi.mock('@assistant-ui/react-ai-sdk', () => ({
  AssistantChatTransport: class {},
  useChatRuntime: (opts: {
    toCreateMessage: (m: { role: string; content: readonly unknown[] }) => unknown;
  }) => {
    captured = opts.toCreateMessage;
    return { runtime: true };
  },
}));

vi.mock('../../../src/lib/mastra-thread-list-adapter', () => ({ mastraThreadListAdapter: {} }));

import { useAgentRuntime } from '../../../src/hooks/use-agent-runtime';
import type { EntityMention } from '../../../src/lib/mention-part';

type Part = { type: string; [k: string]: unknown };

function toCreateMessage(role: string, content: readonly unknown[]): { parts: Part[] } {
  if (!captured) throw new Error('toCreateMessage was never captured');
  return captured({ role, content }) as { parts: Part[] };
}

function renderRuntime(mentionsRef: { current: EntityMention[] }) {
  return renderHook(() => useAgentRuntime({ threadId: 't1', mentionsRef }));
}

describe('useAgentRuntime toCreateMessage — mentions', () => {
  it('appends one data-entity-mention part per mention on a user message', () => {
    const mentionsRef = {
      current: [
        { kind: 'person', id: 'w1', label: 'Jane Doe' },
        { kind: 'person', id: 'w2', label: 'John Roe' },
      ],
    };
    renderRuntime(mentionsRef);

    const out = toCreateMessage('user', [{ type: 'text', text: 'ping @Jane Doe @John Roe' }]);

    expect(out.parts[0]).toEqual({ type: 'text', text: 'ping @Jane Doe @John Roe' });
    const mentions = out.parts.filter((p) => p.type === 'data-entity-mention');
    expect(mentions).toHaveLength(2);
    expect(mentions.map((p) => (p.data as EntityMention).id)).toEqual(['w1', 'w2']);
    expect(mentions[0]?.data).toEqual({ kind: 'person', id: 'w1', label: 'Jane Doe' });
  });

  it('drains the ref so a mention never replays onto the next turn', () => {
    const mentionsRef = { current: [{ kind: 'person', id: 'w1', label: 'Jane' }] };
    renderRuntime(mentionsRef);

    toCreateMessage('user', [{ type: 'text', text: 'first' }]);
    expect(mentionsRef.current).toEqual([]);

    const second = toCreateMessage('user', [{ type: 'text', text: 'second' }]);
    expect(second.parts.filter((p) => p.type === 'data-entity-mention')).toHaveLength(0);
  });

  it('does not attach mentions to assistant messages', () => {
    const mentionsRef = { current: [{ kind: 'person', id: 'w1', label: 'Jane' }] };
    renderRuntime(mentionsRef);

    const out = toCreateMessage('assistant', [{ type: 'text', text: 'hi' }]);
    expect(out.parts.filter((p) => p.type === 'data-entity-mention')).toHaveLength(0);
    // The ref is untouched, so the pending mention still rides the next user turn.
    expect(mentionsRef.current).toHaveLength(1);
  });

  it('emits no mention parts when nothing was mentioned', () => {
    const mentionsRef = { current: [] as EntityMention[] };
    renderRuntime(mentionsRef);

    const out = toCreateMessage('user', [{ type: 'text', text: 'plain' }]);
    expect(out.parts).toEqual([{ type: 'text', text: 'plain' }]);
  });
});

describe('useAgentRuntime toCreateMessage — page-context parity', () => {
  it('still attaches the page-context part alongside mentions', () => {
    const mentionsRef = { current: [{ kind: 'person', id: 'w1', label: 'Jane' }] };
    const pageContextRef = {
      current: { ctx: { kind: 'planner.task', id: 't1', label: 'Q3' }, suppressedFor: null },
    };
    renderHook(() => useAgentRuntime({ threadId: 't1', pageContextRef, mentionsRef }));

    const out = toCreateMessage('user', [{ type: 'text', text: 'hi @Jane' }]);
    expect(out.parts.map((p) => p.type)).toEqual([
      'text',
      'data-page-context',
      'data-entity-mention',
    ]);
  });

  it('honours page-context suppression while still sending mentions', () => {
    const mentionsRef = { current: [{ kind: 'person', id: 'w1', label: 'Jane' }] };
    const pageContextRef = {
      current: { ctx: { kind: 'planner.task', id: 't1', label: 'Q3' }, suppressedFor: 't1' },
    };
    renderHook(() => useAgentRuntime({ threadId: 't1', pageContextRef, mentionsRef }));

    const out = toCreateMessage('user', [{ type: 'text', text: 'hi @Jane' }]);
    expect(out.parts.map((p) => p.type)).toEqual(['text', 'data-entity-mention']);
  });
});
