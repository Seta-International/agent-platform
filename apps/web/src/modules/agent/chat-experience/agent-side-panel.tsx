import { AgentComposer } from './agent-composer';
import { AgentContextChip } from './agent-context-chip';
import { AgentHeader } from './agent-header';
import { AgentTranscript } from './agent-transcript';

interface AgentSidePanelProps {
  onClose?: () => void;
}

export function AgentSidePanel({ onClose }: AgentSidePanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AgentHeader compact onClose={onClose} />
      <AgentContextChip />
      <div className="flex min-h-0 flex-1 flex-col">
        <AgentTranscript />
      </div>
      <AgentComposer compact />
    </div>
  );
}
