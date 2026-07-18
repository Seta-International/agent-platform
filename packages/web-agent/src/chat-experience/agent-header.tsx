import { DropdownMenu, DropdownMenuItem, IconButton } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { MessageSquare, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useThreadList } from '../hooks/use-thread-list';
import { useAgentSelection } from './agent-provider';
import { AgentThreadSwitcher } from './agent-thread-switcher';
import { useChatActions } from './chat-actions';

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
  const navigate = useNavigate();
  const { renameChat, deleteChat } = useChatActions();
  // A freshly-minted client id isn't in the rail until the Mastra row is
  // created on first send. Gate rename/delete on that signal so we don't fire
  // PATCH/DELETE against an id the server doesn't know yet.
  const existsOnServer =
    !!threadId && (groups ?? []).some((g) => g.items.some((i) => i.id === threadId));
  const canEdit = existsOnServer;

  const startRename = () => {
    if (canEdit && threadId) renameChat(threadId, title);
  };
  const onNewChat = () => {
    const nextId = actions.startFreshThread();
    // The floating panel starts a fresh thread in place; only the full page
    // navigates (routing away would close the panel's host page).
    if (!compact) void navigate({ to: '/agent/chat', search: { thread: nextId } });
  };
  const onDelete = () => {
    if (canEdit && threadId) deleteChat(threadId);
  };

  return (
    <header
      // Keep a thin divider under the header, but no bg fill on the full page —
      // the AppShell content is already body-gray, so an explicit bg-body would
      // twin the main top bar. The floating Ask-Seta panel adds its own surface.
      className={`flex flex-none items-center border-b border-border ${
        compact ? 'h-11 bg-body px-3' : 'h-12 px-4'
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
          {/* Plain title — rename lives in the actions menu (and its modal) now. */}
          <span
            className="truncate text-base font-semibold tracking-tight text-primary"
            title={title}
          >
            {title}
          </span>
        </div>

        <div className="flex flex-none items-center gap-1">
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onNewChat}
            label="New chat"
            tooltip="New chat"
            icon={<Plus className="size-4" aria-hidden />}
          />
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
              onClick={startRename}
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
