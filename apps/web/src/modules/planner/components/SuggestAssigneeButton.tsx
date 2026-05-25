import { Button, toast } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { Loader2, Sparkles } from 'lucide-react';
import { useStartAssignBySkill } from '../api/start-assign-by-skill';

interface Props {
  taskId: string;
  taskTitle: string;
}

/**
 * Out-of-chat trigger for the assignBySkill workflow (spec §4.2).
 * POSTs to /api/copilot/v1/workflows/runs/assignBySkill/start and surfaces
 * the run via the workflow-approvals inbox — never via the chat panel.
 */
export function SuggestAssigneeButton({ taskId, taskTitle }: Props) {
  const navigate = useNavigate();
  const start = useStartAssignBySkill();

  const onClick = () =>
    start.mutate(taskId, {
      onSuccess: ({ runId }) => {
        toast.success('Suggest started', {
          description: `Ranking candidates for "${taskTitle}".`,
          action: {
            label: 'Open in inbox',
            onClick: () => {
              void navigate({ to: '/copilot/workflows/runs/$runId', params: { runId } });
            },
          },
        });
      },
      onError: (err) =>
        toast.error("Couldn't start Suggest", {
          description: err instanceof Error ? err.message : String(err),
        }),
    });

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={start.isPending}
      aria-label="Suggest assignee"
      type="button"
    >
      {start.isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Sparkles className="size-3" />
      )}
      Suggest
    </Button>
  );
}
