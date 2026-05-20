import { useAui, useAuiState } from '@assistant-ui/react';
import { ChatComposer } from '@seta/shared-ui';
import { useState } from 'react';
import { COPILOT_COPY } from '../i18n';
import { AgentSelector } from './agent-selector';
import type { AgentName } from './agents';
import { ModelSelector } from './model-selector';

interface ChatComposerContainerProps {
  agentName: AgentName;
  onAgentChange: (next: AgentName) => void;
  modelKey: string;
  onModelChange: (next: string) => void;
}

export function ChatComposerContainer({
  agentName,
  onAgentChange,
  modelKey,
  onModelChange,
}: ChatComposerContainerProps) {
  const [value, setValue] = useState('');
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);

  const submit = () => {
    if (!value.trim() || isRunning) return;
    aui.composer().setText(value);
    aui.composer().send();
    setValue('');
  };

  return (
    <ChatComposer
      value={value}
      onChange={setValue}
      onSubmit={submit}
      pending={isRunning}
      placeholder={COPILOT_COPY.composerPlaceholder}
      toolbar={
        <>
          <ModelSelector value={modelKey} onChange={onModelChange} variant="ghost" />
          <AgentSelector value={agentName} onChange={onAgentChange} variant="ghost" />
        </>
      }
    />
  );
}
