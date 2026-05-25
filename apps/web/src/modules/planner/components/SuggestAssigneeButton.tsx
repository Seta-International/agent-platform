import { Button } from '@seta/shared-ui';
import { Sparkles } from 'lucide-react';
import { usePanelUI } from '../../copilot/chat-experience/copilot-provider';

interface Props {
  taskId: string;
  taskTitle: string;
}

/**
 * Out-of-chat trigger for the assignBySkill workflow (spec §8 Push trigger).
 * Opens the copilot panel and prefills the composer with a templated request.
 * The agent routes to planner_suggestAssignee, which suspends with the HITL
 * candidate-list card rendered in the chat panel.
 */
export function SuggestAssigneeButton({ taskId, taskTitle }: Props) {
  const { setPanelOpen, setPendingPrompt } = usePanelUI();

  const onClick = () => {
    setPanelOpen(true);
    setPendingPrompt({
      text: `Suggest an assignee for task "${taskTitle}" (id: ${taskId})`,
      autoSend: true,
    });
  };

  return (
    <Button size="sm" variant="ghost" onClick={onClick} aria-label="Suggest assignee" type="button">
      <Sparkles className="size-3" />
      Suggest
    </Button>
  );
}
