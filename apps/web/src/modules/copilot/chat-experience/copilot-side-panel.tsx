import { CopilotComposer } from './copilot-composer';
import { CopilotContextChip } from './copilot-context-chip';
import { CopilotHeader } from './copilot-header';
import { CopilotTranscript } from './copilot-transcript';

interface CopilotSidePanelProps {
  onClose?: () => void;
}

export function CopilotSidePanel({ onClose }: CopilotSidePanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <CopilotHeader compact onClose={onClose} />
      <CopilotContextChip />
      <div className="flex min-h-0 flex-1 flex-col">
        <CopilotTranscript />
      </div>
      <CopilotComposer compact />
    </div>
  );
}
