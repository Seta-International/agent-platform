import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { Menu, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useThreadList } from '../hooks/use-thread-list';
import { useDeleteThread, useRenameThread } from '../hooks/use-thread-mutations';
import { useCopilotSelection } from './copilot-provider';

interface CopilotHeaderProps {
  compact?: boolean;
  onOpenMobileNav?: () => void;
}

function useTitleFor(threadId: string | undefined): string {
  const { groups } = useThreadList();
  if (!threadId) return 'New chat';
  const titleById = new Map(
    (groups ?? []).flatMap((g) => g.items.map((i) => [i.id, i.title] as const)),
  );
  return titleById.get(threadId) ?? 'Untitled chat';
}

export function CopilotHeader({ compact = false, onOpenMobileNav }: CopilotHeaderProps) {
  const { selection, actions } = useCopilotSelection();
  const threadId = selection.threadId;
  const title = useTitleFor(threadId);
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rename = useRenameThread();
  const remove = useDeleteThread();
  const navigate = useNavigate();
  const canEdit = Boolean(threadId);
  const editing = draft !== null;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEdit = () => setDraft(title);
  const cancelEdit = () => setDraft(null);
  const commit = () => {
    const next = (draft ?? '').trim();
    setDraft(null);
    if (!threadId || !next || next === title) return;
    rename.mutate({ id: threadId, title: next });
  };
  const onDelete = () => {
    if (!threadId) return;
    if (!window.confirm("Delete this chat? You won't be able to get it back.")) return;
    remove.mutate(threadId, {
      onSuccess: () => {
        actions.setThreadId(undefined);
        void navigate({ to: '/copilot/chat', search: { thread: undefined } });
      },
    });
  };

  // PR-A always renders the full variant. `compact` is reserved for PR-B.
  void compact;

  return (
    <header className="flex h-14 flex-none items-center justify-between gap-4 border-b border-hairline bg-canvas px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {onOpenMobileNav && (
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Open chats"
            className="-ml-1 inline-flex size-8 flex-none items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink lg:hidden"
          >
            <Menu className="size-4" aria-hidden />
          </button>
        )}
        {editing ? (
          <input
            ref={inputRef}
            value={draft ?? ''}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
            aria-label="Chat name"
            className="min-w-0 flex-1 bg-transparent text-card-title font-semibold tracking-tight text-ink focus:outline-none"
          />
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="text-card-title m-0 truncate font-semibold tracking-tight text-ink">
              {title}
            </h1>
            <button
              type="button"
              onClick={() => canEdit && startEdit()}
              disabled={!canEdit}
              aria-label="Rename chat"
              className="inline-flex size-6 flex-none items-center justify-center rounded-md text-ink-tertiary hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-none items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Chat actions"
              disabled={!canEdit}
              className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MoreHorizontal className="size-3.5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuItem onSelect={startEdit} className="gap-2">
              <Pencil className="size-3.5" aria-hidden />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Delete chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
