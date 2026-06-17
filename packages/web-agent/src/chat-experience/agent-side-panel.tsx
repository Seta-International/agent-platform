import { AgentComposer } from './agent-composer';
import { AgentContextChip } from './agent-context-chip';
import { AgentHeader } from './agent-header';
import { AgentTranscript } from './agent-transcript';

interface AgentSidePanelProps {
  onClose?: () => void;
  showThreadSwitcher?: boolean;
}

export function AgentSidePanel({ onClose, showThreadSwitcher = true }: AgentSidePanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AgentHeader compact showThreadSwitcher={showThreadSwitcher} onClose={onClose} />
      <AgentContextChip />
      <div className="flex min-h-0 flex-1 flex-col">
        <AgentTranscript />
      </div>
      <AgentComposer compact />
    </div>
  );
}
