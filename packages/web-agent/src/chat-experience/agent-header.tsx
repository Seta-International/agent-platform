import { DropdownMenu, DropdownMenuItem, IconButton } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { MessageSquare, MoreHorizontal, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useThreadList } from '../hooks/use-thread-list';
import { useDeleteThread, useRenameThread } from '../hooks/use-thread-mutations';
import { useAgentSelection } from './agent-provider';
import { AgentThreadSwitcher } from './agent-thread-switcher';

interface AgentHeaderProps {
  compact?: boolean;
  showThreadSwitcher?: boolean;
  onClose?: () => void;
}

// Astryx's compound DropdownMenuItem has no divider sub-component (data-driven only).
function MenuDivider() {
  return (
    <hr
      aria-hidden
      style={{
        height: 1,
        margin: '4px 6px',
        border: 'none',
        backgroundColor: 'var(--color-border)',
      }}
    />
  );
}

function useTitleFor(threadId: string | undefined): string {
  const { groups } = useThreadList();
  if (!threadId) return 'New chat';
  const titleById = new Map(
    (groups ?? []).flatMap((g) => g.items.map((i) => [i.id, i.title] as const)),
  );
  // Not found in the rail = either still loading, or a freshly-minted id whose
  // Mastra row hasn't been created yet (no first message sent). Render "New
  // chat" until either the title generation lands or the row appears.
  return titleById.get(threadId) ?? 'New chat';
}

export function AgentHeader({
  compact = false,
  showThreadSwitcher = true,
  onClose,
}: AgentHeaderProps) {
  const { selection, actions } = useAgentSelection();
  const threadId = selection.threadId;
  const title = useTitleFor(threadId);
  const { groups } = useThreadList();
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rename = useRenameThread();
  const remove = useDeleteThread();
  const navigate = useNavigate();
  // A freshly-minted client id isn't in the rail until the Mastra row is
  // created on first send. Gate rename/delete on that signal so we don't fire
  // PATCH/DELETE against an id the server doesn't know yet.
  const existsOnServer =
    !!threadId && (groups ?? []).some((g) => g.items.some((i) => i.id === threadId));
  const canEdit = existsOnServer;
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
        const nextId = actions.startFreshThread();
        void navigate({ to: '/agent/chat', search: { thread: nextId }, replace: true });
      },
    });
  };

  return (
    <header
      // Full page: no bg/border — the AppShell content is already body-gray, so
      // an explicit bg-body + divider just twins the main top bar. The floating
      // Ask-Seta panel keeps its own surface + divider to read as a panel header.
      className={`flex flex-none items-center ${
        compact ? 'h-11 border-b border-border bg-body px-3' : 'h-12 px-4'
      }`}
    >
      {/* Non-compact header rides the same 45rem reading column as the
          transcript so the title and actions sit directly above the messages
          instead of stranding the title at the far left. */}
      <div className={`flex w-full items-center gap-2 ${compact ? '' : 'mx-auto max-w-[45rem]'}`}>
        {/* The floating Ask-Seta panel has no breadcrumb, so it keeps an
            identity mark; the full page already shows "Agent Studio" above. */}
        {compact && (
          <span
            aria-hidden
            className="inline-flex size-5 flex-none items-center justify-center rounded-md bg-accent-muted text-accent"
          >
            <Sparkles className="size-3" />
          </span>
        )}

        <div className="flex min-w-0 flex-1 items-center">
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
              className="min-w-0 flex-1 bg-transparent text-base font-semibold tracking-tight text-primary focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => canEdit && startEdit()}
              disabled={!canEdit}
              title={canEdit ? 'Rename chat' : title}
              className="group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 -mx-1 text-left text-base font-semibold tracking-tight text-primary hover:bg-surface disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="truncate">{title}</span>
              <Pencil
                className="size-3 flex-none text-disabled opacity-0 transition-opacity group-hover:opacity-100 group-disabled:hidden"
                aria-hidden
              />
            </button>
          )}
        </div>

        <div className="flex flex-none items-center gap-1">
          <DropdownMenu
            placement="below"
            menuWidth={220}
            button={{
              isIconOnly: true,
              icon: <MoreHorizontal className="size-4" aria-hidden />,
              variant: 'ghost',
              size: 'sm',
              label: 'Chat actions',
              isDisabled: !canEdit && !compact,
            }}
          >
            {compact && showThreadSwitcher && (
              <>
                <AgentThreadSwitcher />
                <MenuDivider />
              </>
            )}
            {compact && !showThreadSwitcher && (
              <>
                <DropdownMenuItem
                  icon={<MessageSquare className="size-3.5" aria-hidden />}
                  label="View all chats"
                  onClick={() => void navigate({ to: '/agent/chat' })}
                />
                <MenuDivider />
              </>
            )}
            <DropdownMenuItem
              icon={<Pencil className="size-3.5" aria-hidden />}
              label="Rename"
              isDisabled={!canEdit}
              onClick={startEdit}
            />
            <MenuDivider />
            <DropdownMenuItem
              icon={<Trash2 className="size-3.5" aria-hidden />}
              label="Delete chat"
              style={{ color: 'var(--color-error)' }}
              isDisabled={!canEdit}
              onClick={onDelete}
            />
          </DropdownMenu>
          {onClose && (
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              label="Close agent panel"
              tooltip="Close"
              icon={<X className="size-4" aria-hidden />}
            />
          )}
        </div>
      </div>
    </header>
  );
}
