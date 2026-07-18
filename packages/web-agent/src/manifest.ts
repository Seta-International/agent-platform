import type { AppManifest, NavItem, NavSection } from '@seta/module-sdk';
import { useNavigate } from '@tanstack/react-router';
import { BookOpen, MessageSquare, Plus, Sparkles, Workflow } from 'lucide-react';
import { createElement, useState } from 'react';
import { useAgentSelection } from './chat-experience/agent-provider';
import { ThreadRowMenu } from './chat-experience/thread-row-menu';
import { useThreadList } from './hooks/use-thread-list';

// How many recent threads to reveal before "Show more", and the reveal step.
const INITIAL_THREADS = 8;
const THREAD_STEP = 12;

/**
 * Hangs the user's recent chat threads under the static "Chat" nav item as
 * collapsible sub-items with a client-side "Show more" — the sidebar replaces
 * the old middle history column. `mergeNavSections` in the shell folds these
 * children onto `agent.chat` (which stays in static `nav` so pathname-based
 * active resolution keeps working). Runs only while Agent Studio is the active
 * app, so it never fetches threads on other surfaces.
 */
function useAgentNavExtensions(): NavSection[] {
  const { groups } = useThreadList();
  const { selection, actions } = useAgentSelection();
  const navigate = useNavigate();
  const [limit, setLimit] = useState(INITIAL_THREADS);

  const threads = (groups ?? []).flatMap((g) => g.items);

  // "New chat" always leads the list — even with no history — so starting a
  // fresh thread stays one click away from where the recents live.
  const children: NavItem[] = [
    {
      id: 'agent.chat.new',
      label: 'New chat',
      icon: Plus,
      onClick: () => {
        const nextId = actions.startFreshThread();
        void navigate({ to: '/agent/chat', search: { thread: nextId } });
      },
    },
    ...threads.slice(0, limit).map((t) => ({
      id: `agent.chat.thread.${t.id}`,
      label: t.title,
      isSelected: selection.threadId === t.id,
      onClick: () => void navigate({ to: '/agent/chat', search: { thread: t.id } }),
      endContent: createElement(ThreadRowMenu, { threadId: t.id, title: t.title }),
    })),
  ];
  if (threads.length > limit) {
    children.push({
      id: 'agent.chat.more',
      label: 'Show more',
      italic: true,
      onClick: () => setLimit((l) => l + THREAD_STEP),
    });
  }

  return [
    {
      label: 'Workspace',
      // Only `children`/`collapsible` are consumed by the merge; the base
      // `agent.chat` item keeps its label/icon/route.
      items: [
        { id: 'agent.chat', label: 'Chat', collapsible: { defaultIsCollapsed: false }, children },
      ],
    },
  ];
}

export const agentAppManifest: AppManifest = {
  id: 'agent',
  routeNamespace: '/agent',
  label: 'Agent Studio',
  icon: Sparkles,
  color: '#8b5cf6',
  requiredPermissions: [],
  useNavExtensions: useAgentNavExtensions,
  nav: [
    {
      label: 'Workspace',
      items: [
        { id: 'agent.chat', icon: MessageSquare, label: 'Chat', to: '/agent/chat' },
        { id: 'agent.workflows', icon: Workflow, label: 'Workflows', to: '/agent/workflows' },
        { id: 'agent.knowledge', icon: BookOpen, label: 'Knowledge', to: '/agent/knowledge' },
      ],
    },
  ],
};
