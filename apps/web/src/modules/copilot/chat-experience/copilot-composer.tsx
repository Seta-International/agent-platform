import { useAui, useAuiState } from '@assistant-ui/react';
import { ChatComposer } from '@seta/shared-ui';
import { useState } from 'react';
import { AgentSelector } from '../components/agent-selector';
import type { AgentName } from '../components/agents';
import { ModelSelector } from '../components/model-selector';
import { COPILOT_COPY } from '../i18n';
import { useCopilotSelection } from './copilot-provider';

interface CopilotComposerProps {
  compact?: boolean;
}

export function CopilotComposer({ compact = false }: CopilotComposerProps) {
  const [value, setValue] = useState('');
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const { selection, actions } = useCopilotSelection();

  const submit = () => {
    if (!value.trim() || isRunning) return;
    // Page-context attachment is wired in useCopilotRuntime's toCreateMessage
    // override (assistant-ui v0.14.5 rejects arbitrary parts on composer.addAttachment).
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
          <ModelSelector
            value={selection.modelKey}
            onChange={actions.setModelKey}
            variant="ghost"
            compact={compact}
          />
          <AgentSelector
            value={selection.agentName as AgentName}
            onChange={(n) => actions.setAgentName(n)}
            variant="ghost"
            compact={compact}
          />
        </>
      }
    />
  );
}
