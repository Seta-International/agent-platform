import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useThreadList } from '../hooks/use-thread-list';
import { useCopilotSelection } from './copilot-provider';

interface CopilotThreadSwitcherProps {
  onAfterSelect?: () => void;
}

export function CopilotThreadSwitcher({ onAfterSelect }: CopilotThreadSwitcherProps) {
  const { groups } = useThreadList();
  const { actions, selection } = useCopilotSelection();
  const navigate = useNavigate();

  const flat = (groups ?? [])
    .flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))
    .slice(0, 8);

  return (
    <>
      <DropdownMenuItem
        onSelect={() => {
          actions.setThreadId(undefined);
          onAfterSelect?.();
        }}
        className="gap-2"
      >
        <Plus className="size-3.5" aria-hidden />
        New chat
      </DropdownMenuItem>
      {flat.length > 0 && <DropdownMenuSeparator />}
      {flat.length > 0 && (
        <DropdownMenuLabel className="text-caption uppercase tracking-wide text-ink-subtle">
          Recent
        </DropdownMenuLabel>
      )}
      {flat.map((t) => (
        <DropdownMenuItem
          key={t.id}
          onSelect={() => {
            actions.setThreadId(t.id);
            onAfterSelect?.();
          }}
          className={`gap-2 ${selection.threadId === t.id ? 'bg-surface-2' : ''}`}
        >
          <span className="truncate">{t.title || 'Untitled chat'}</span>
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => {
          void navigate({ to: '/copilot/chat', search: { thread: selection.threadId } });
          onAfterSelect?.();
        }}
        className="gap-2 text-ink-muted"
      >
        Show all in /copilot/chat
      </DropdownMenuItem>
    </>
  );
}
