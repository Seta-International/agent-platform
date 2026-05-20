import { useAui, useAuiState } from '@assistant-ui/react';
import { ChatComposer } from '@seta/shared-ui';
import { useState } from 'react';
import { COPILOT_COPY } from '../i18n';

export function ChatComposerContainer() {
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
      permissionHint={COPILOT_COPY.composerHint}
      agentSelector={
        <span className="inline-flex items-center gap-1.5 text-caption">
          <span className="size-2 rounded-full bg-primary" />
          Supervisor
        </span>
      }
    />
  );
}
