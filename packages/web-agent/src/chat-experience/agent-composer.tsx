import { useAui, useAuiState } from '@assistant-ui/react';
import { attachmentsBlockSend, ChatComposer } from '@seta/shared-ui';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ModelSelector } from '../components/model-selector';
import { useChatAttachments } from '../hooks/use-chat-attachments';
import { AGENT_COPY } from '../i18n';
import { useAgentRuntimeContext, useAgentSelection, usePanelUI } from './agent-provider';

interface AgentComposerProps {
  compact?: boolean;
}

export function AgentComposer({ compact = false }: AgentComposerProps) {
  const [value, setValue] = useState('');
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const { selection, actions } = useAgentSelection();
  const { pendingPrompt, setPendingPrompt } = usePanelUI();
  const { runError, clearRunError } = useAgentRuntimeContext();
  const { attachments, attach, remove, reset, warning } = useChatAttachments(selection.threadId);

  const submit = () => {
    if (!value.trim() || isRunning) return;
    if (attachmentsBlockSend(attachments)) return;
    // A fresh send clears any prior run error (e.g. a context-overflow 413).
    clearRunError();
    // Page-context attachment is wired in useAgentRuntime's toCreateMessage
    // override (assistant-ui v0.14.5 rejects arbitrary parts on composer.addAttachment).
    aui.composer().setText(value);
    aui.composer().send();
    setValue('');
    // Files persist server-side keyed by thread_id; the orchestrator finds them
    // on this and future turns. Clear the upload chips for the next message.
    reset();
  };

  // One-shot pending prompt from external callers (e.g. planner "Suggest
  // assignee" button). Only autoSend mode is wired today; non-autoSend can
  // be added later by routing through aui.composer().setText (the local
  // `value` mirror is updated by aui via the ChatComposer onChange).
  useEffect(() => {
    if (!pendingPrompt || isRunning) return;
    const { text, autoSend } = pendingPrompt;
    setPendingPrompt(null);
    if (autoSend) {
      aui.composer().setText(text);
      aui.composer().send();
      return;
    }
    aui.composer().setText(text);
  }, [pendingPrompt, isRunning, aui, setPendingPrompt]);

  return (
    <>
      {runError && (
        <div className="border-t border-hairline bg-canvas px-3 pt-3 md:px-4">
          <div className="mx-auto flex max-w-conversation items-start gap-2 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-3 py-2 text-caption text-[var(--color-danger)]">
            <span role="alert" className="min-w-0 flex-1 break-words">
              {runError}
            </span>
            <button
              type="button"
              onClick={clearRunError}
              aria-label="Dismiss error"
              className="flex-none opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}
      <ChatComposer
        value={value}
        onChange={setValue}
        onSubmit={submit}
        pending={isRunning}
        placeholder={AGENT_COPY.composerPlaceholder}
        permissionHint={warning ?? undefined}
        attachments={attachments}
        onAttachFiles={attach}
        onRemoveAttachment={remove}
        toolbar={
          <ModelSelector
            value={selection.modelKey}
            onChange={actions.setModelKey}
            variant="ghost"
            compact={compact}
          />
        }
      />
    </>
  );
}
