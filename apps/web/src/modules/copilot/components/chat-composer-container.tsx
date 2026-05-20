import { useAui, useThread } from '@assistant-ui/react';
import { ChatComposer } from '@seta/shared-ui';
import { useState } from 'react';
import { COPILOT_COPY } from '../i18n';

export function ChatComposerContainer({ agentName: _agentName }: { agentName: 'router' | 'self' }) {
  const [value, setValue] = useState('');
  const aui = useAui();
  // useThread is the stable way to read reactive thread state when inside AssistantRuntimeProvider
  const isRunning = useThread((s) => s.isRunning);

  const submit = () => {
    if (!value.trim() || isRunning) return;
    // setText syncs our controlled value into the runtime composer, then send() dispatches it
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
