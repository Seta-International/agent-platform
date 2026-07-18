import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  startFreshThread: vi.fn(() => 'new-1'),
  threadId: 't2' as string | undefined,
  groups: undefined as { label: string; items: { id: string; title: string }[] }[] | undefined,
}));

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }));
vi.mock('../../src/hooks/use-thread-list', () => ({ useThreadList: () => ({ groups: h.groups }) }));
vi.mock('../../src/chat-experience/agent-provider', () => ({
  useAgentSelection: () => ({
    selection: { threadId: h.threadId },
    actions: { startFreshThread: h.startFreshThread },
  }),
}));

import { agentAppManifest } from '../../src/manifest';

const threads = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, title: `Thread ${i + 1}` }));

describe('agent manifest useNavExtensions', () => {
  beforeEach(() => {
    h.navigate.mockClear();
    h.threadId = 't2';
    h.groups = undefined;
  });

  it('always leads with a New chat item, even with no history', () => {
    const { result } = renderHook(() => agentAppManifest.useNavExtensions());
    const chat = result.current[0]?.items[0];
    expect(chat?.id).toBe('agent.chat');
    expect(chat?.children?.map((c) => c.id)).toEqual(['agent.chat.new']);
  });

  it('starts a fresh thread when New chat is clicked', () => {
    const { result } = renderHook(() => agentAppManifest.useNavExtensions());
    result.current[0]?.items[0]?.children?.[0]?.onClick?.();
    expect(h.startFreshThread).toHaveBeenCalledOnce();
    expect(h.navigate).toHaveBeenCalledWith({ to: '/agent/chat', search: { thread: 'new-1' } });
  });

  it('hangs recent threads after New chat and marks the selected one', () => {
    h.groups = [{ label: 'Today', items: threads(3) }];
    const { result } = renderHook(() => agentAppManifest.useNavExtensions());

    const chat = result.current[0]?.items[0];
    expect(result.current[0]?.label).toBe('Workspace');
    expect(chat?.id).toBe('agent.chat');
    expect(chat?.collapsible).toEqual({ defaultIsCollapsed: false });
    expect(chat?.children?.map((c) => c.label)).toEqual([
      'New chat',
      'Thread 1',
      'Thread 2',
      'Thread 3',
    ]);
    // Selection (t2) drives the child's own selected state.
    expect(chat?.children?.find((c) => c.id === 'agent.chat.thread.t2')?.isSelected).toBe(true);
    expect(chat?.children?.find((c) => c.id === 'agent.chat.thread.t1')?.isSelected).toBe(false);
  });

  it('caps the list at 8 with a "Show more" that reveals the rest', () => {
    h.groups = [{ label: 'Today', items: threads(10) }];
    const { result } = renderHook(() => agentAppManifest.useNavExtensions());

    let children = result.current[0]?.items[0]?.children ?? [];
    // New chat + 8 threads + the Show more row.
    expect(children).toHaveLength(10);
    expect(children.at(-1)?.id).toBe('agent.chat.more');
    expect(children.at(-1)?.label).toBe('Show more');

    act(() => children.at(-1)?.onClick?.());

    children = result.current[0]?.items[0]?.children ?? [];
    // 10 ≤ 8 + 12, so all threads show and the row is gone: New chat + 10.
    expect(children).toHaveLength(11);
    expect(children.at(-1)?.id).toBe('agent.chat.thread.t10');
  });
});
