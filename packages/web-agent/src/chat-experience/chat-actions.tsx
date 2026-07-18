import {
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  Input,
  Layout,
  LayoutContent,
  useConfirm,
} from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { useDeleteThread, useRenameThread } from '../hooks/use-thread-mutations';

interface ChatActions {
  /** Open the rename modal seeded with the thread's current title. */
  renameChat: (id: string, currentTitle: string) => void;
  /** Confirm, then delete; if the deleted thread was open, jump to a fresh chat. */
  deleteChat: (id: string) => void;
}

const ChatActionsContext = createContext<ChatActions | null>(null);

export function useChatActions(): ChatActions {
  const ctx = useContext(ChatActionsContext);
  if (!ctx) throw new Error('useChatActions must be used within a <ChatActionsProvider>');
  return ctx;
}

/**
 * Hosts the chat rename modal and the delete confirmation so both the header
 * and the sidebar thread rows drive rename/delete through the same modals
 * (no inline editing, no native confirm). Mount inside AgentProvider so it sits
 * above both the shell nav and the chat surface.
 */
interface ChatActionsProviderProps {
  children: ReactNode;
  /** The open thread — deleting it (vs. another row) triggers the redirect. */
  currentThreadId: string;
  /** Mint + select a fresh thread after the open one is deleted. */
  startFreshThread: () => string;
}

export function ChatActionsProvider({
  children,
  currentThreadId,
  startFreshThread,
}: ChatActionsProviderProps) {
  const confirm = useConfirm();
  const rename = useRenameThread();
  const remove = useDeleteThread();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [draft, setDraft] = useState('');

  const closeRename = useCallback(() => setRenaming(null), []);

  const renameChat = useCallback((id: string, currentTitle: string) => {
    setRenaming({ id, title: currentTitle });
    setDraft(currentTitle);
  }, []);

  const submitRename = useCallback(() => {
    const next = draft.trim();
    if (renaming && next && next !== renaming.title) {
      rename.mutate({ id: renaming.id, title: next });
    }
    setRenaming(null);
  }, [draft, renaming, rename]);

  const deleteChat = useCallback(
    (id: string) => {
      void (async () => {
        const ok = await confirm({
          title: 'Delete chat?',
          description: "You won't be able to get it back.",
          confirmLabel: 'Delete',
        });
        if (!ok) return;
        remove.mutate(id, {
          onSuccess: () => {
            // Only the currently-open thread needs a redirect; deleting another
            // thread from the sidebar leaves the current conversation in place.
            if (id !== currentThreadId) return;
            const nextId = startFreshThread();
            void navigate({ to: '/agent/chat', search: { thread: nextId }, replace: true });
          },
        });
      })();
    },
    [confirm, remove, currentThreadId, startFreshThread, navigate],
  );

  const value = useMemo<ChatActions>(() => ({ renameChat, deleteChat }), [renameChat, deleteChat]);

  return (
    <ChatActionsContext.Provider value={value}>
      {children}
      <Dialog
        isOpen={renaming !== null}
        onOpenChange={(open) => {
          if (!open) closeRename();
        }}
        purpose="form"
        width={420}
      >
        <Layout
          header={
            <DialogHeader
              title="Rename chat"
              onOpenChange={(open) => {
                if (!open) closeRename();
              }}
            />
          }
          content={
            <LayoutContent>
              <div className="pt-1">
                <Input label="Chat name" value={draft} onChange={setDraft} hasAutoFocus />
              </div>
            </LayoutContent>
          }
          footer={
            <DialogFooter>
              <Button variant="secondary" label="Cancel" onClick={closeRename} />
              <Button
                variant="primary"
                label="Save"
                onClick={submitRename}
                isDisabled={!draft.trim()}
              />
            </DialogFooter>
          }
        />
      </Dialog>
    </ChatActionsContext.Provider>
  );
}
