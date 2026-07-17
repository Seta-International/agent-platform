import { AgentConversation } from './agent-conversation';
import { AgentHeader } from './agent-header';

interface AgentSidePanelProps {
  onClose?: () => void;
  showThreadSwitcher?: boolean;
}

export function AgentSidePanel({ onClose, showThreadSwitcher = true }: AgentSidePanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AgentHeader compact showThreadSwitcher={showThreadSwitcher} onClose={onClose} />
      {/* The page-context chip now lives in the composer header (FUT-670).
          No sizing wrapper needed: ChatLayout's root is already `flex: 1`
          with `min-height: 0`, so it fills this column on its own. */}
      <AgentConversation />
    </div>
  );
}
