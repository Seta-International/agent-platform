import { DropdownMenuItem } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useThreadList } from '../hooks/use-thread-list';
import { useAgentSelection } from './agent-provider';

interface AgentThreadSwitcherProps {
  onAfterSelect?: () => void;
}

// Astryx's compound DropdownMenuItem has no divider/label sub-components (those only
// exist for data-driven `items`); plain nodes render fine since useListFocus's keyboard
// nav only queries `[role="menuitem"]` in the DOM, not React children shape.
function MenuDivider() {
  return (
    <hr
      aria-hidden
      style={{
        height: 1,
        margin: '4px 6px',
        border: 'none',
        backgroundColor: 'var(--color-hairline)',
      }}
    />
  );
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
      {flat.length > 0 && <MenuDivider />}
      {flat.length > 0 && (
        <div
          className="text-caption uppercase tracking-wide text-ink-subtle"
          style={{ padding: '4px 8px' }}
        >
          Recent
        </div>
      )}
      {flat.map((t) => (
        <DropdownMenuItem
          key={t.id}
          label={<span className="truncate">{t.title || 'Untitled chat'}</span>}
          style={
            selection.threadId === t.id ? { backgroundColor: 'var(--color-surface-2)' } : undefined
          }
          onClick={() => {
            actions.setThreadId(t.id);
            onAfterSelect?.();
          }}
        />
      ))}
      <MenuDivider />
      <DropdownMenuItem
        label="Show all in /agent/chat"
        className="text-ink-muted"
        onClick={() => {
          void navigate({ to: '/agent/chat', search: { thread: selection.threadId } });
          onAfterSelect?.();
        }}
      />
    </>
  );
}
