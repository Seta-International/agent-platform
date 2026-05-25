import { useAui, useAuiState } from '@assistant-ui/react';
import { ChatComposer } from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { ModelSelector } from '../components/model-selector';
import { COPILOT_COPY } from '../i18n';
import { useCopilotSelection, usePanelUI } from './copilot-provider';

interface CopilotComposerProps {
  compact?: boolean;
}

export function CopilotComposer({ compact = false }: CopilotComposerProps) {
  const [value, setValue] = useState('');
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const { selection, actions } = useCopilotSelection();
  const { pendingPrompt, setPendingPrompt } = usePanelUI();

  const submit = () => {
    if (!value.trim() || isRunning) return;
    // Page-context attachment is wired in useCopilotRuntime's toCreateMessage
    // override (assistant-ui v0.14.5 rejects arbitrary parts on composer.addAttachment).
    aui.composer().setText(value);
    aui.composer().send();
    setValue('');
  };

  useEffect(() => {
    if (!pendingPrompt || isRunning) return;
    const { text, autoSend } = pendingPrompt;
    setPendingPrompt(null);
    if (autoSend) {
      aui.composer().setText(text);
      aui.composer().send();
      return;
    }
    setValue(text);
  }, [pendingPrompt, isRunning, aui, setPendingPrompt]);

  return (
    <ChatComposer
      value={value}
      onChange={setValue}
      onSubmit={submit}
      pending={isRunning}
      placeholder={COPILOT_COPY.composerPlaceholder}
      toolbar={
        <ModelSelector
          value={selection.modelKey}
          onChange={actions.setModelKey}
          variant="ghost"
          compact={compact}
        />
      }
    />
  );
}
