import { Divider, DropdownMenuItem, Text } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useThreadList } from '../hooks/use-thread-list';
import { useAgentSelection } from './agent-provider';

interface AgentThreadSwitcherProps {
  onAfterSelect?: () => void;
}

export function AgentThreadSwitcher({ onAfterSelect }: AgentThreadSwitcherProps) {
  const { groups } = useThreadList();
  const { actions, selection } = useAgentSelection();
  const navigate = useNavigate();

  const flat = (groups ?? [])
    .flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))
    .slice(0, 8);

  return (
    <>
      <DropdownMenuItem
        icon={<Plus className="size-3.5" aria-hidden />}
        label="New chat"
        onClick={() => {
          actions.startFreshThread();
          onAfterSelect?.();
        }}
      />
      {/* Astryx's DropdownMenu has no divider/label sub-components of its own (those only
          exist for data-driven `items`); the general-purpose Divider renders fine interspersed
          here since useListFocus's keyboard nav only queries `[role="menuitem"]`, not children shape. */}
      {flat.length > 0 && <Divider label="Recent" />}
      {flat.map((t) => (
        <DropdownMenuItem
          key={t.id}
          label={<span className="truncate">{t.title || 'Untitled chat'}</span>}
          style={
            selection.threadId === t.id
              ? { backgroundColor: 'var(--color-background-surface)' }
              : undefined
          }
          onClick={() => {
            actions.setThreadId(t.id);
            onAfterSelect?.();
          }}
        />
      ))}
      <Divider />
      <DropdownMenuItem
        // A className on the DropdownMenuItem root can't reach Item's label — the label
        // paints its own color in a child <span>, so the muted tone has to live there.
        label={<Text color="secondary">Show all in /agent/chat</Text>}
        onClick={() => {
          void navigate({ to: '/agent/chat', search: { thread: selection.threadId } });
          onAfterSelect?.();
        }}
      />
    </>
  );
}
