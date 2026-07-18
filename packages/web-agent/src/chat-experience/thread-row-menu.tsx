import { DropdownMenu, DropdownMenuItem } from '@seta/shared-ui';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useChatActions } from './chat-actions';

/**
 * Per-thread overflow menu for the sidebar recents — Rename / Delete, routed
 * through the shared chat modals (`useChatActions`). Rendered as a SideNavItem
 * `endContent`. Hidden until the row is hovered/focused (or the menu is open):
 * the `group/navrow` class lives on the row wrapper in nav-sections.
 */
export function ThreadRowMenu({ threadId, title }: { threadId: string; title: string }) {
  const { renameChat, deleteChat } = useChatActions();
  return (
    // The menu lives inside the row's clickable area, so its trigger click would
    // otherwise bubble to the row's navigate and switch threads. Stop it here so
    // opening the menu never changes which chat is selected.
    // biome-ignore lint/a11y/noStaticElementInteractions: wrapper only guards propagation; the menu button owns the semantics
    <span
      className="-mr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/navrow:opacity-100 has-[[aria-expanded='true']]:opacity-100"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu
        placement="below"
        menuWidth={160}
        button={{
          isIconOnly: true,
          icon: <MoreHorizontal className="size-4" aria-hidden />,
          variant: 'ghost',
          size: 'sm',
          label: 'Chat options',
        }}
      >
        <DropdownMenuItem
          icon={<Pencil className="size-3.5" aria-hidden />}
          label="Rename"
          onClick={() => renameChat(threadId, title)}
        />
        <DropdownMenuItem
          icon={<Trash2 className="size-3.5" aria-hidden />}
          label="Delete"
          onClick={() => deleteChat(threadId)}
        />
      </DropdownMenu>
    </span>
  );
}
